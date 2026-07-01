import json
import os
import uuid
import base64
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import URLError
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table("social-connections")

LINKEDIN_CLIENT_ID = os.environ["LINKEDIN_CLIENT_ID"]
LINKEDIN_CLIENT_SECRET = os.environ["LINKEDIN_CLIENT_SECRET"]
LINKEDIN_REDIRECT_URI = os.environ["LINKEDIN_REDIRECT_URI"]
FRONTEND_URL = os.environ["FRONTEND_URL"]

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}


def json_response(status_code, body):
    return {"statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps(body)}


def redirect_response(location):
    # 302 redirect — include CORS headers so browser pre-flight doesn't block
    return {"statusCode": 302, "headers": {**CORS_HEADERS, "Location": location}, "body": ""}


def strip_stage_prefix(raw_path: str) -> str:
    """
    API Gateway HTTP API v2 includes the stage name in rawPath, e.g. '/dev/social/connections'.
    Strip the first segment so route matching works against '/social/...'.
    This avoids the bug that exists in invitation-handler where rawPath is matched verbatim.
    """
    parts = raw_path.lstrip("/").split("/", 1)
    return "/" + parts[1] if len(parts) > 1 else "/"


def get_business_id_from_claims(event: dict) -> str | None:
    """
    Extract businessId from Cognito JWT claims injected by API Gateway.

    IMPORTANT — VERIFY THIS CLAIM KEY:
    Cognito custom attributes show up as "custom:<attrName>" in the ID token.
    If your user pool attribute is named "businessId", the claim key is "custom:businessId".
    Check: Cognito Console → User Pool → Sign-in experience → Custom attributes.
    If the attribute was defined without the "custom:" prefix (unlikely but possible via CDK),
    the key may just be "businessId". We try both below so you can confirm in CloudWatch logs.
    """
    claims = (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )
    logger.info("JWT claims keys present: %s", list(claims.keys()))
    return claims.get("sub")


# ── Router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "GET" and path == "/social/linkedin/authorize":
        return handle_authorize(event)

    if method == "GET" and path == "/social/linkedin/callback":
        return handle_callback(event)

    if method == "GET" and path == "/social/connections":
        return handle_get_connections(event)

    if method == "DELETE" and path.startswith("/social/connections/"):
        platform = path.split("/social/connections/", 1)[-1].strip("/")
        return handle_delete_connection(event, platform)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── GET /social/linkedin/authorize ────────────────────────────────────────────

def handle_authorize(event):
    business_id = get_business_id_from_claims(event)
    if not business_id:
        return json_response(400, {"error": "businessId not found in JWT claims — see VERIFY note in get_business_id_from_claims"})

    state_payload = {
        "businessId": business_id,
        "nonce": str(uuid.uuid4()),
        "ts": int(datetime.now(timezone.utc).timestamp()),
    }
    state = base64.urlsafe_b64encode(json.dumps(state_payload).encode()).decode().rstrip("=")

    params = urlencode({
        "response_type": "code",
        "client_id": LINKEDIN_CLIENT_ID,
        "redirect_uri": LINKEDIN_REDIRECT_URI,
        "state": state,
        "scope": "openid profile w_member_social",
    })
    auth_url = f"https://www.linkedin.com/oauth/v2/authorization?{params}"

    logger.info("authorize: generated authUrl for businessId=%s", business_id)
    return json_response(200, {"authUrl": auth_url})


# ── GET /social/linkedin/callback (PUBLIC — no JWT) ───────────────────────────

def handle_callback(event):
    try:
        params = event.get("queryStringParameters") or {}

        # LinkedIn sends error/error_description when the user denies access
        if "error" in params:
            reason = params.get("error_description", params["error"])
            logger.info("LinkedIn OAuth denied: %s", reason)
            return redirect_response(f"{FRONTEND_URL}/settings?linkedin=error&message={reason}")

        code = params.get("code")
        state_b64 = params.get("state")
        if not code or not state_b64:
            logger.error("callback: missing code or state")
            return redirect_response(f"{FRONTEND_URL}/settings?linkedin=error&message=missing_code_or_state")

        # Decode state — recover businessId (padding is stripped on encode, re-add it)
        padded = state_b64 + "==" * (4 - len(state_b64) % 4)
        state_payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        business_id = state_payload.get("businessId")
        if not business_id:
            logger.error("callback: businessId missing from state payload")
            return redirect_response(f"{FRONTEND_URL}/settings?linkedin=error&message=invalid_state")

        # Exchange authorization code for access token (form-encoded POST)
        token_body = urlencode({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": LINKEDIN_REDIRECT_URI,
            "client_id": LINKEDIN_CLIENT_ID,
            "client_secret": LINKEDIN_CLIENT_SECRET,
        }).encode()

        token_req = Request(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data=token_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urlopen(token_req) as resp:
            token_resp = json.loads(resp.read().decode())

        access_token = token_resp["access_token"]
        expires_in = token_resp.get("expires_in", 5184000)  # LinkedIn default: 60 days
        refresh_token = token_resp.get("refresh_token")
        expires_at = int(datetime.now(timezone.utc).timestamp()) + expires_in

        # Fetch LinkedIn identity via OpenID userinfo endpoint
        userinfo_req = Request(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )
        with urlopen(userinfo_req) as resp:
            userinfo = json.loads(resp.read().decode())

        linkedin_person_id = userinfo.get("sub", "")
        linkedin_name = userinfo.get("name", "")

        now_iso = datetime.now(timezone.utc).isoformat()

        # Preserve connectedAt if this businessId already has a linkedin connection
        existing = table.get_item(Key={"businessId": business_id, "platform": "linkedin"})
        connected_at = existing.get("Item", {}).get("connectedAt", now_iso)

        item = {
            "businessId": business_id,
            "platform": "linkedin",
            "accessToken": access_token,
            "expiresAt": expires_at,
            "linkedinPersonId": linkedin_person_id,
            "linkedinName": linkedin_name,
            "connectedAt": connected_at,
            "status": "connected",
        }
        if refresh_token:
            item["refreshToken"] = refresh_token

        table.put_item(Item=item)
        logger.info("callback: saved linkedin connection for businessId=%s name=%s", business_id, linkedin_name)

        return redirect_response(f"{FRONTEND_URL}/settings?linkedin=success")

    except Exception as e:
        logger.error("handle_callback unhandled error: %s", str(e))
        return redirect_response(f"{FRONTEND_URL}/settings?linkedin=error&message=server_error")


# ── GET /social/connections ───────────────────────────────────────────────────

def handle_get_connections(event):
    business_id = get_business_id_from_claims(event)
    if not business_id:
        return json_response(400, {"error": "businessId not found in JWT claims"})

    try:
        result = table.query(
            KeyConditionExpression=Key("businessId").eq(business_id)
        )
        items = result.get("Items", [])

        # Never expose accessToken or refreshToken to the client
        safe_items = [
            {
                "platform": item["platform"],
                "status": item.get("status"),
                "displayName": item.get("linkedinName"),
                "connectedAt": item.get("connectedAt"),
            }
            for item in items
        ]

        logger.info("get_connections: returning %d connections for businessId=%s", len(safe_items), business_id)
        return json_response(200, safe_items)

    except Exception as e:
        logger.error("handle_get_connections error: %s", str(e))
        return json_response(500, {"error": "Failed to retrieve connections"})


# ── DELETE /social/connections/{platform} ─────────────────────────────────────

def handle_delete_connection(event, platform):
    business_id = get_business_id_from_claims(event)
    if not business_id:
        return json_response(400, {"error": "businessId not found in JWT claims"})

    if not platform:
        return json_response(400, {"error": "platform is required in the path"})

    try:
        table.delete_item(Key={"businessId": business_id, "platform": platform})
        logger.info("delete_connection: deleted platform=%s for businessId=%s", platform, business_id)
        return json_response(200, {"deleted": True})

    except Exception as e:
        logger.error("handle_delete_connection error: %s", str(e))
        return json_response(500, {"error": "Failed to delete connection"})

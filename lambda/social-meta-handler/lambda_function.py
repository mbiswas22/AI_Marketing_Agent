import json
import os
import uuid
import base64
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table("social-connections")

META_APP_ID = os.environ["META_APP_ID"]
META_APP_SECRET = os.environ["META_APP_SECRET"]
META_REDIRECT_URI = os.environ["META_REDIRECT_URI"]
FRONTEND_URL = os.environ["FRONTEND_URL"]
META_CONFIG_ID = os.environ["META_CONFIG_ID"]

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}


def json_response(status_code, body):
    return {"statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps(body)}


def redirect_response(location):
    return {"statusCode": 302, "headers": {**CORS_HEADERS, "Location": location}, "body": ""}


def strip_stage_prefix(raw_path: str) -> str:
    """
    API Gateway HTTP API v2 includes the stage name in rawPath, e.g. '/dev/social/meta/callback'.
    Strip the first segment so route matching works against '/social/...'.
    """
    parts = raw_path.lstrip("/").split("/", 1)
    return "/" + parts[1] if len(parts) > 1 else "/"


def get_sub_from_claims(event: dict):
    claims = (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )
    return claims.get("sub")


def read_http_error(e: HTTPError) -> str:
    try:
        return e.read().decode("utf-8")
    except Exception:
        return str(e)


# ── Router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "GET" and path == "/social/meta/authorize":
        return handle_authorize(event)

    if method == "GET" and path == "/social/meta/callback":
        return handle_callback(event)

    if method == "GET" and path == "/social/meta/pages":
        return handle_get_pages(event)

    if method == "DELETE" and path == "/social/connections/facebook":
        return handle_delete_facebook(event)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── GET /social/meta/authorize ────────────────────────────────────────────────

def handle_authorize(event):
    sub = get_sub_from_claims(event)
    if not sub:
        return json_response(400, {"error": "businessId not found in JWT claims"})

    state_payload = {
        "businessId": sub,
        "nonce": str(uuid.uuid4()),
        "ts": int(datetime.now(timezone.utc).timestamp()),
    }
    state = base64.urlsafe_b64encode(json.dumps(state_payload).encode()).decode().rstrip("=")

    params = urlencode({
        "client_id": META_APP_ID,
        "redirect_uri": META_REDIRECT_URI,
        "state": state,
        "response_type": "code",
        "config_id": META_CONFIG_ID,
    })
    auth_url = f"https://www.facebook.com/v19.0/dialog/oauth?{params}"

    logger.info("authorize: generated authUrl for businessId=%s", sub)
    return json_response(200, {"authUrl": auth_url})


# ── GET /social/meta/callback (PUBLIC — no JWT) ───────────────────────────────

def handle_callback(event):
    try:
        params = event.get("queryStringParameters") or {}

        if "error" in params:
            reason = params.get("error_description", params["error"])
            logger.info("Facebook OAuth denied: %s", reason)
            return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message={reason}")

        code = params.get("code")
        state_b64 = params.get("state")
        if not code or not state_b64:
            logger.error("callback: missing code or state")
            return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message=missing_code_or_state")

        # Decode state — padding is stripped on encode, restore it
        padded = state_b64 + "==" * (4 - len(state_b64) % 4)
        state_payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        business_id = state_payload.get("businessId")
        if not business_id:
            logger.error("callback: businessId missing from state payload")
            return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message=invalid_state")

        # Exchange code for short-lived user token
        short_token_url = (
            "https://graph.facebook.com/v19.0/oauth/access_token?"
            + urlencode({
                "client_id": META_APP_ID,
                "redirect_uri": META_REDIRECT_URI,
                "client_secret": META_APP_SECRET,
                "code": code,
            })
        )
        with urlopen(Request(short_token_url, method="GET")) as resp:
            short_token_data = json.loads(resp.read().decode())

        short_lived_token = short_token_data.get("access_token")
        if not short_lived_token:
            logger.error("callback: no short-lived token in response: %s", short_token_data)
            return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message=token_exchange_failed")

        logger.info("callback: obtained short-lived token for businessId=%s", business_id)

        # Exchange short-lived token for long-lived token (60 days)
        ll_token_url = (
            "https://graph.facebook.com/v19.0/oauth/access_token?"
            + urlencode({
                "grant_type": "fb_exchange_token",
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "fb_exchange_token": short_lived_token,
            })
        )
        with urlopen(Request(ll_token_url, method="GET")) as resp:
            ll_token_data = json.loads(resp.read().decode())

        long_lived_token = ll_token_data.get("access_token")
        if not long_lived_token:
            logger.error("callback: no long-lived token in response: %s", ll_token_data)
            return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message=token_exchange_failed")

        logger.info("callback: obtained long-lived token for businessId=%s", business_id)

        # Get Page access token from /me/accounts
        accounts_url = (
            "https://graph.facebook.com/v19.0/me/accounts?"
            + urlencode({"access_token": long_lived_token})
        )
        with urlopen(Request(accounts_url, method="GET")) as resp:
            accounts_data = json.loads(resp.read().decode())

        pages = accounts_data.get("data", [])
        page = pages[0] if pages else None
        if not page:
            logger.error("callback: no pages granted in /me/accounts for businessId=%s", business_id)
            return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message=page_not_found")

        page_id = page.get("id")
        page_access_token = page.get("access_token")
        page_name = page.get("name", "")
        logger.info("callback: found page '%s' (id=%s)", page_name, page_id)

        # Get user identity
        me_url = (
            "https://graph.facebook.com/v19.0/me?"
            + urlencode({"fields": "id,name", "access_token": long_lived_token})
        )
        with urlopen(Request(me_url, method="GET")) as resp:
            me_data = json.loads(resp.read().decode())

        facebook_user_id = me_data.get("id", "")
        facebook_user_name = me_data.get("name", "")

        now_iso = datetime.now(timezone.utc).isoformat()
        expires_at = int(datetime.now(timezone.utc).timestamp()) + 5184000  # 60 days

        # Preserve connectedAt if reconnecting
        existing = table.get_item(Key={"businessId": business_id, "platform": "facebook"})
        connected_at = existing.get("Item", {}).get("connectedAt", now_iso)

        table.put_item(Item={
            "businessId": business_id,
            "platform": "facebook",
            "userAccessToken": long_lived_token,
            "pageAccessToken": page_access_token,
            "pageId": page_id,
            "pageName": page_name,
            "facebookUserId": facebook_user_id,
            "facebookUserName": facebook_user_name,
            "connectedAt": connected_at,
            "status": "connected",
            "expiresAt": expires_at,
        })

        logger.info(
            "callback: saved facebook connection for businessId=%s pageName=%s",
            business_id,
            page_name,
        )
        return redirect_response(f"{FRONTEND_URL}/settings?facebook=success")

    except Exception as e:
        logger.error("handle_callback unhandled error: %s", str(e))
        return redirect_response(f"{FRONTEND_URL}/settings?facebook=error&message=server_error")


# ── GET /social/meta/pages ────────────────────────────────────────────────────

def handle_get_pages(event):
    sub = get_sub_from_claims(event)
    if not sub:
        return json_response(400, {"error": "businessId not found in JWT claims"})

    try:
        result = table.get_item(Key={"businessId": sub, "platform": "facebook"})
        item = result.get("Item")
        if not item:
            return json_response(200, {"platform": "facebook", "status": "not_connected"})

        # Never expose access tokens to the client
        return json_response(200, {
            "platform": "facebook",
            "status": item.get("status"),
            "pageName": item.get("pageName"),
            "pageId": item.get("pageId"),
            "connectedAt": item.get("connectedAt"),
        })

    except Exception as e:
        logger.error("handle_get_pages error: %s", str(e))
        return json_response(500, {"error": "Failed to retrieve Facebook page info"})


# ── DELETE /social/connections/facebook ───────────────────────────────────────

def handle_delete_facebook(event):
    sub = get_sub_from_claims(event)
    if not sub:
        return json_response(400, {"error": "businessId not found in JWT claims"})

    try:
        table.delete_item(Key={"businessId": sub, "platform": "facebook"})
        logger.info("delete_facebook: deleted connection for businessId=%s", sub)
        return json_response(200, {"deleted": True})

    except Exception as e:
        logger.error("handle_delete_facebook error: %s", str(e))
        return json_response(500, {"error": "Failed to delete Facebook connection"})

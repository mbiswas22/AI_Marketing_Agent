import json
import os
import uuid
import base64
import logging
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

from adapters.meta import MetaAdapter
from adapters.linkedin import LinkedInAdapter

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb         = boto3.resource("dynamodb", region_name="us-east-2")
connections_table = dynamodb.Table("social-connections")
user_table        = dynamodb.Table("user")
audit_table       = dynamodb.Table("AuditEvent")

FRONTEND_URL = os.environ["FRONTEND_URL"]
META_REDIRECT_URI = os.environ["META_REDIRECT_URI"]
LINKEDIN_REDIRECT_URI = os.environ["LINKEDIN_REDIRECT_URI"]

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

# Platform -> adapter instance. Adding a platform later = one new adapter file
# + one new entry here + REDIRECT_URIS below, no router logic changes.
ADAPTERS = {
    "meta": MetaAdapter(),
    "linkedin": LinkedInAdapter(),
}
REDIRECT_URIS = {
    "meta": META_REDIRECT_URI,
    "linkedin": LINKEDIN_REDIRECT_URI,
}


def write_audit_event(action, user_id, entity_id, result="SUCCESS", metadata=None):
    try:
        event_id = "EVT-" + str(uuid.uuid4())[:8].upper()
        item = {
            "eventId":   event_id,
            "action":    action,
            "userId":    user_id or "unknown",
            "entityId":  entity_id,
            "result":    result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if metadata:
            item["metadata"] = metadata
        audit_table.put_item(Item=item)
        logger.info("Wrote audit event: %s action=%s entity=%s", event_id, action, entity_id)
    except Exception as e:
        logger.error("Failed to write audit event: %s", str(e))


def json_response(status_code, body):
    return {"statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps(body)}


def redirect_response(location):
    return {"statusCode": 302, "headers": {**CORS_HEADERS, "Location": location}, "body": ""}


def strip_stage_prefix(raw_path: str) -> str:
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


def get_query_param(event: dict, name: str):
    params = event.get("queryStringParameters") or {}
    return params.get(name)


def require_admin(event: dict, business_id: str) -> str:
    """Looks up the caller's real role for this specific business from the
    canonical `user` table (businessId+userId), not the custom:role JWT claim
    — see SOCIAL_CONSOLIDATION_FINDINGS.md §5 on why that claim isn't trusted.
    Returns the caller's sub on success."""
    sub = get_sub_from_claims(event)
    if not sub:
        raise PermissionError("Not authenticated")
    result = user_table.get_item(Key={"businessId": business_id, "userId": sub})
    user_item = result.get("Item")
    if not user_item or user_item.get("role") != "ADMIN":
        raise PermissionError("Admin role required")
    return sub


# ── Router ────────────────────────────────────────────────────────────────────
# Phase 5 cutover: matches the real /social/... paths directly (previously
# /social-v2/... for isolated Phase 2/3 testing — that prefix is retired now
# that this Lambda is live behind the real routes).

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "GET" and path == "/social/meta/authorize":
        return handle_authorize(event, "meta")
    if method == "GET" and path == "/social/meta/callback":
        return handle_callback(event, "meta")
    if method == "GET" and path == "/social/meta/pages":
        return handle_get_platform_status(event, "facebook")
    if method == "GET" and path == "/social/meta/instagram":
        return handle_get_platform_status(event, "instagram")

    if method == "GET" and path == "/social/linkedin/authorize":
        return handle_authorize(event, "linkedin")
    if method == "GET" and path == "/social/linkedin/callback":
        return handle_callback(event, "linkedin")

    if method == "GET" and path == "/social/connections":
        return handle_get_connections(event)

    if method == "DELETE" and path.startswith("/social/connections/"):
        platform = path.split("/social/connections/", 1)[-1].strip("/")
        return handle_delete_connection(event, platform)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── GET /social/{meta|linkedin}/authorize ───────────────────────────────────

def handle_authorize(event, adapter_key):
    business_id = get_query_param(event, "businessId")
    if not business_id:
        return json_response(400, {"error": "businessId query parameter is required"})

    try:
        sub = require_admin(event, business_id)
    except PermissionError as e:
        return json_response(403, {"error": str(e)})

    state_payload = {
        "businessId": business_id,
        "connectedByUserId": sub,
        "nonce": str(uuid.uuid4()),
        "ts": int(datetime.now(timezone.utc).timestamp()),
    }
    state = base64.urlsafe_b64encode(json.dumps(state_payload).encode()).decode().rstrip("=")

    adapter = ADAPTERS[adapter_key]
    redirect_uri = REDIRECT_URIS[adapter_key]
    auth_url = adapter.get_authorize_url(redirect_uri, state)

    logger.info("authorize: generated authUrl for businessId=%s adapter=%s", business_id, adapter_key)
    return json_response(200, {"authUrl": auth_url})


# ── GET /social/{meta|linkedin}/callback (PUBLIC — no JWT) ──────────────────

def handle_callback(event, adapter_key):
    try:
        params = event.get("queryStringParameters") or {}

        if "error" in params:
            reason = params.get("error_description", params["error"])
            logger.info("%s OAuth denied: %s", adapter_key, reason)
            return redirect_response(f"{FRONTEND_URL}/settings?{adapter_key}=error&message={reason}")

        code = params.get("code")
        state_b64 = params.get("state")
        if not code or not state_b64:
            logger.error("callback: missing code or state")
            return redirect_response(f"{FRONTEND_URL}/settings?{adapter_key}=error&message=missing_code_or_state")

        padded = state_b64 + "==" * (4 - len(state_b64) % 4)
        state_payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        business_id = state_payload.get("businessId")
        if not business_id:
            logger.error("callback: businessId missing from state payload")
            return redirect_response(f"{FRONTEND_URL}/settings?{adapter_key}=error&message=invalid_state")

        adapter = ADAPTERS[adapter_key]
        redirect_uri = REDIRECT_URIS[adapter_key]
        result = adapter.exchange_code_for_token(code, redirect_uri)

        now_iso = datetime.now(timezone.utc).isoformat()
        for platform, fields in result.items():
            sk = f"{platform}#primary"
            existing = connections_table.get_item(
                Key={"businessId": business_id, "platform": sk}
            )
            connected_at = existing.get("Item", {}).get("connectedAt", now_iso)

            item = {
                "businessId": business_id,
                "platform": sk,
                "platformName": platform,
                "connectionId": "primary",
                "status": "connected",
                "connectedAt": connected_at,
                "connectedByUserId": state_payload.get("connectedByUserId", ""),
                **fields,
            }
            connections_table.put_item(Item=item)
            logger.info("callback: saved %s connection for businessId=%s", platform, business_id)
            write_audit_event(
                action="ENABLE_CHANNEL",
                user_id=state_payload.get("connectedByUserId", business_id),
                entity_id=business_id,
                result="SUCCESS",
                metadata={"platform": platform, "adapter": adapter_key}
            )

        return redirect_response(f"{FRONTEND_URL}/settings?{adapter_key}=success")

    except Exception as e:
        logger.error("handle_callback error: %s", str(e))
        return redirect_response(f"{FRONTEND_URL}/settings?{adapter_key}=error&message=server_error")


# ── GET /social/connections ─────────────────────────────────────────────────

def handle_get_connections(event):
    business_id = get_query_param(event, "businessId")
    if not business_id:
        return json_response(400, {"error": "businessId query parameter is required"})

    sub = get_sub_from_claims(event)
    if not sub:
        return json_response(401, {"error": "Not authenticated"})

    try:
        result = connections_table.query(KeyConditionExpression=Key("businessId").eq(business_id))
        items = result.get("Items", [])

        # Never expose tokens to the client
        safe_items = [
            {
                "platform": item.get("platformName"),
                "connectionId": item.get("connectionId", "primary"),
                "status": item.get("status"),
                "displayName": item.get("pageName") or item.get("linkedinName") or item.get("facebookUserName"),
                "connectedAt": item.get("connectedAt"),
            }
            for item in items
        ]
        return json_response(200, safe_items)

    except Exception as e:
        logger.error("handle_get_connections error: %s", str(e))
        return json_response(500, {"error": "Failed to retrieve connections"})


# ── GET /social/meta/{pages|instagram} ──────────────────────────────────────
# Thin single-platform views, preserved so the real /social/meta/pages and
# /social/meta/instagram paths need zero frontend change at cutover.

def handle_get_platform_status(event, platform):
    business_id = get_query_param(event, "businessId")
    if not business_id:
        return json_response(400, {"error": "businessId query parameter is required"})

    sub = get_sub_from_claims(event)
    if not sub:
        return json_response(401, {"error": "Not authenticated"})

    try:
        sk = f"{platform}#primary"
        result = connections_table.get_item(Key={"businessId": business_id, "platform": sk})
        item = result.get("Item")
        if not item:
            return json_response(200, {"platform": platform, "status": "not_connected"})

        response = {
            "platform": platform,
            "status": item.get("status"),
            "pageName": item.get("pageName"),
            "connectedAt": item.get("connectedAt"),
        }
        if platform == "instagram":
            response["instagramBusinessAccountId"] = item.get("instagramBusinessAccountId")
        else:
            response["pageId"] = item.get("pageId")
        return json_response(200, response)

    except Exception as e:
        logger.error("handle_get_platform_status error: %s", str(e))
        return json_response(500, {"error": f"Failed to retrieve {platform} info"})


# ── DELETE /social/connections/{platform} ───────────────────────────────────

def handle_delete_connection(event, platform):
    if not platform:
        return json_response(400, {"error": "platform is required in the path"})

    business_id = get_query_param(event, "businessId")
    if not business_id:
        return json_response(400, {"error": "businessId query parameter is required"})

    try:
        require_admin(event, business_id)
    except PermissionError as e:
        return json_response(403, {"error": str(e)})

    connection_id = get_query_param(event, "connectionId") or "primary"

    try:
        sk = f"{platform}#{connection_id}"
        connections_table.delete_item(Key={"businessId": business_id, "platform": sk})
        logger.info("delete_connection: deleted platform=%s connectionId=%s for businessId=%s", platform, connection_id, business_id)
        write_audit_event(
            action="DISABLE_CHANNEL",
            user_id=get_sub_from_claims(event),
            entity_id=business_id,
            result="SUCCESS",
            metadata={"platform": platform, "connectionId": connection_id}
        )
        return json_response(200, {"deleted": True})

    except Exception as e:
        logger.error("handle_delete_connection error: %s", str(e))
        return json_response(500, {"error": "Failed to delete connection"})

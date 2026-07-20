import json
import os
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
connections_table = dynamodb.Table("social-connections")
history_table = dynamodb.Table("AIMarketingHistory")

S3_BUCKET_NAME = os.environ["S3_BUCKET_NAME"]
s3_client = boto3.client("s3", region_name="us-east-2")

LINKEDIN_VERSION = "202501"

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}


def json_response(status_code, body):
    return {"statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps(body)}


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


def read_http_error(e: HTTPError) -> str:
    try:
        return e.read().decode("utf-8")
    except Exception:
        return str(e)


def linkedin_post_json(url: str, access_token: str, body: dict) -> tuple:
    data = json.dumps(body).encode("utf-8")
    req = Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
        },
        method="POST",
    )
    with urlopen(req) as resp:
        raw = resp.read()
        headers = resp.getheaders()
        body_str = raw.decode("utf-8") if raw else "{}"
        try:
            return json.loads(body_str), headers
        except Exception:
            return {}, headers


def get_header(headers: list, name: str) -> str:
    name_lower = name.lower()
    for k, v in headers:
        if k.lower() == name_lower:
            return v
    return ""


def update_history_status(action_id: str, status: str, post_id: str = None):
    """Update the history item status. Silently skips if action_id is missing."""
    if not action_id:
        return
    try:
        update_expr = "SET #s = :status, publishedAt = :ts"
        expr_values = {
            ":status": status,
            ":ts": datetime.now(timezone.utc).isoformat(),
        }
        if post_id:
            update_expr += ", linkedinPostId = :pid"
            expr_values[":pid"] = post_id
        history_table.update_item(
            Key={"action_id": action_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues=expr_values,
        )
        logger.info("history updated: action_id=%s status=%s", action_id, status)
    except Exception as e:
        logger.error("failed to update history status: %s", str(e))


# ── Router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    # EventBridge scheduled invocation — no requestContext
    if "requestContext" not in event and event.get("action_id"):
        return handle_scheduled_publish(event)

    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "POST" and path == "/social/linkedin/publish":
        return handle_publish(event)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── EventBridge scheduled publish ─────────────────────────────────────────────

def handle_scheduled_publish(event):
    """Called directly by EventBridge — event is the raw Input payload."""
    try:
        action_id = event.get("action_id")
        user_id = event.get("userId")
        caption = event.get("caption", "")
        image_url = event.get("imageUrl", "")
        platforms = event.get("platforms", [])
        rule_name = event.get("ruleName")

        logger.info("scheduled publish: action_id=%s user_id=%s platforms=%s", action_id, user_id, platforms)

        # Derive image_key from imageUrl if present
        image_key = None
        if image_url:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(image_url)
                image_key = parsed.path.lstrip("/")
            except Exception:
                pass

        # Look up LinkedIn connection by userId (sub)
        result = connections_table.get_item(Key={"businessId": user_id, "platform": "linkedin"})
        item = result.get("Item")
        if not item:
            logger.error("scheduled publish: LinkedIn not connected for user=%s", user_id)
            update_history_status(action_id, "publish_failed")
            return {"success": False, "error": "LinkedIn not connected"}

        access_token = item.get("accessToken")
        linkedin_person_id = item.get("linkedinPersonId")
        if not access_token or not linkedin_person_id:
            update_history_status(action_id, "publish_failed")
            return {"success": False, "error": "LinkedIn connection incomplete"}

        post_id = _post_to_linkedin(access_token, linkedin_person_id, caption, image_key)

        update_history_status(action_id, "published", post_id)

        # Disable the EventBridge rule so it doesn't fire again
        if rule_name:
            try:
                events_client = boto3.client("events", region_name="us-east-2")
                events_client.disable_rule(Name=rule_name)
                logger.info("disabled EventBridge rule: %s", rule_name)
            except Exception as e:
                logger.warning("could not disable rule %s: %s", rule_name, str(e))

        return {"success": True, "postId": post_id}

    except Exception as e:
        logger.error("handle_scheduled_publish error: %s", str(e))
        update_history_status(event.get("action_id"), "publish_failed")
        return {"success": False, "error": str(e)}


# ── POST /social/linkedin/publish ─────────────────────────────────────────────

def handle_publish(event):
    try:
        sub = get_sub_from_claims(event)
        if not sub:
            return json_response(400, {"error": "User not authenticated"})

        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        text = body.get("text", "")
        image_key = body.get("image_key") or body.get("s3_key")
        action_id = body.get("action_id")

        if not text and not image_key:
            return json_response(400, {"error": "At least one of text or image_key is required"})

        result = connections_table.get_item(Key={"businessId": sub, "platform": "linkedin"})
        item = result.get("Item")
        if not item:
            return json_response(400, {"error": "LinkedIn not connected. Please connect LinkedIn in Account Settings."})

        access_token = item.get("accessToken")
        linkedin_person_id = item.get("linkedinPersonId")
        if not access_token or not linkedin_person_id:
            return json_response(400, {"error": "LinkedIn connection is incomplete. Please reconnect."})

        try:
            post_id = _post_to_linkedin(access_token, linkedin_person_id, text, image_key)
        except HTTPError as e:
            detail = read_http_error(e)
            logger.error("post creation failed: %s %s", e.code, detail)
            return json_response(500, {"error": f"LinkedIn post creation failed (HTTP {e.code})", "detail": detail})

        update_history_status(action_id, "published", post_id)

        logger.info("publish: post created successfully post_id=%s", post_id)
        return json_response(200, {"success": True, "postId": post_id})

    except Exception as e:
        logger.error("handle_publish unhandled error: %s", str(e))
        return json_response(500, {"error": f"Unexpected error: {str(e)}"})


# ── Shared LinkedIn posting logic ─────────────────────────────────────────────

def _post_to_linkedin(access_token: str, linkedin_person_id: str, text: str, image_key: str = None) -> str:
    """Build and send the LinkedIn post. Returns the post ID."""
    author_urn = f"urn:li:person:{linkedin_person_id}"

    if image_key:
        s3_obj = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=image_key)
        image_binary = s3_obj["Body"].read()
        content_type = s3_obj.get("ContentType", "image/png")
        logger.info("downloaded image from S3, size=%d bytes", len(image_binary))

        try:
            init_body, _ = linkedin_post_json(
                "https://api.linkedin.com/rest/images?action=initializeUpload",
                access_token,
                {"initializeUploadRequest": {"owner": author_urn}},
            )
        except HTTPError as e:
            detail = read_http_error(e)
            logger.error("initializeUpload failed: %s %s", e.code, detail)
            raise

        upload_url = init_body.get("value", {}).get("uploadUrl")
        image_urn = init_body.get("value", {}).get("image")
        if not upload_url or not image_urn:
            raise Exception(f"LinkedIn did not return upload URL: {init_body}")

        put_req = Request(
            upload_url,
            data=image_binary,
            headers={"Content-Type": content_type},
            method="PUT",
        )
        with urlopen(put_req) as put_resp:
            logger.info("image uploaded, status=%s", put_resp.status)

        post_payload = {
            "author": author_urn,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "content": {"media": {"id": image_urn}},
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }
    else:
        post_payload = {
            "author": author_urn,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }

    _, resp_headers = linkedin_post_json(
        "https://api.linkedin.com/rest/posts",
        access_token,
        post_payload,
    )
    return get_header(resp_headers, "x-restli-id")

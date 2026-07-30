import json
import os
import logging
from datetime import datetime, timezone
import boto3

from adapters.facebook import FacebookAdapter            # kept for reference / instant rollback
from adapters.facebook_make import FacebookMakeAdapter    # NEW
from adapters.instagram import InstagramAdapter
from adapters.linkedin import LinkedInAdapter

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
connections_table = dynamodb.Table("social-connections")
history_table = dynamodb.Table("AIMarketingHistory")  # NEW — reuse this table

S3_BUCKET_NAME = os.environ["S3_BUCKET_NAME"]
s3_client = boto3.client("s3", region_name="us-east-2")

# NEW — Make.com webhook config
MAKE_WEBHOOK_URL = os.environ["MAKE_WEBHOOK_URL"]
MAKE_WEBHOOK_SECRET = os.environ["MAKE_WEBHOOK_SECRET"]

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

# platform -> adapter instance. Adding a platform later = one new adapter file
# + one new entry here + one new route, no other router changes.
ADAPTERS = {
    # CHANGED: facebook now routes through Make.com instead of calling the
    # Graph API directly from this Lambda. To roll back instantly, swap
    # this back to FacebookAdapter(s3_client, S3_BUCKET_NAME).
    "facebook": FacebookMakeAdapter(s3_client, S3_BUCKET_NAME),
    "instagram": InstagramAdapter(s3_client, S3_BUCKET_NAME),
    "linkedin": LinkedInAdapter(s3_client, S3_BUCKET_NAME),
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


def get_connection(business_id: str, platform: str, connection_id: str = "primary"):
    # social-connections' real sort key attribute is named "platform" (fixed
    # table schema) — the composite value goes into it, e.g. "facebook#primary".
    sk = f"{platform}#{connection_id}"
    result = connections_table.get_item(Key={"businessId": business_id, "platform": sk})
    return result.get("Item")


def update_history_status(user_id: str, created_at: str, status: str, post_id: str = None, post_id_field: str = "postId"):
    """
    AIMarketingHistory is keyed by userId/createdAt, so this only works
    when the caller actually has a createdAt to key on. On-demand publish
    passes it through from the frontend; the scheduler's execute_schedule()
    does NOT currently pass createdAt when it invokes this Lambda, so
    scheduled Facebook posts will log correctly but won't get an
    AIMarketingHistory row updated until that's added on the scheduler side.
    """
    if not user_id or not created_at:
        logger.info("update_history_status: skipped (missing user_id or created_at) status=%s", status)
        return
    try:
        update_expr = "SET #s = :status, publishedAt = :ts"
        expr_names = {"#s": "status"}
        expr_values = {
            ":status": status,
            ":ts": datetime.now(timezone.utc).isoformat(),
        }
        if post_id:
            update_expr += ", #pid = :pid"
            expr_names["#pid"] = post_id_field
            expr_values[":pid"] = post_id
        history_table.update_item(
            Key={"userId": user_id, "createdAt": created_at},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
        )
        logger.info("history updated: userId=%s createdAt=%s status=%s", user_id, created_at, status)
    except Exception as e:
        logger.error("failed to update history status: %s", str(e))


# ── Router ────────────────────────────────────────────────────────────────────
# Phase 5 cutover: matches the real /social/... paths directly (previously
# /social-v2/... for isolated Phase 3 testing — that prefix is retired now
# that this Lambda is live behind the real routes).

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "POST" and path == "/social/meta/publish":
        return handle_publish(event, "facebook")
    if method == "POST" and path == "/social/meta/instagram/publish":
        return handle_publish(event, "instagram")
    if method == "POST" and path == "/social/linkedin/publish":
        return handle_publish(event, "linkedin")

    # NEW — Make.com calls this back once it has actually posted to Facebook.
    if method == "POST" and path == "/social/meta/publish-result":
        return handle_facebook_publish_callback(event)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── POST /social/{meta|meta/instagram|linkedin}/publish ────────────────────
# No role restriction — any authenticated user of the business can publish.

def handle_publish(event, platform):
    try:
        sub = get_sub_from_claims(event)
        if not sub:
            return json_response(401, {"error": "Not authenticated"})

        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        business_id = body.get("businessId") or (event.get("queryStringParameters") or {}).get("businessId")
        if not business_id:
            return json_response(400, {"error": "businessId is required"})

        text = body.get("text", "")
        image_key = body.get("image_key")
        video_key = body.get("video_key")
        connection_id = body.get("connectionId", "primary")
        created_at = body.get("createdAt")  # NEW — only reliably present on the on-demand path today

        if not text and not image_key and not video_key:
            return json_response(400, {"error": "At least one of text, image_key, or video_key is required"})

        # Facebook no longer needs a stored social-connections item — Make.com
        # routes to the right Page using businessId alone, and an admin
        # configures that mapping on Make's side, not via this app's OAuth.
        if platform == "facebook":
            connection = {"businessId": business_id}
        else:
            connection = get_connection(business_id, platform, connection_id)
            if not connection:
                return json_response(400, {"error": f"{platform} not connected for this business"})

        adapter = ADAPTERS[platform]
        logger.info("publish: platform=%s businessId=%s userId=%s image_key=%s video_key=%s has_text=%s",
                    platform, business_id, sub, image_key, video_key, bool(text))

        # NEW — Facebook's adapter needs created_at so it can round-trip it
        # through Make.com and let the callback find the right history row.
        # Other adapters' publish() signatures don't accept this kwarg, so
        # it's only passed for facebook.
        publish_kwargs = {"image_key": image_key, "video_key": video_key}
        if platform == "facebook":
            publish_kwargs["created_at"] = created_at

        result = adapter.publish(connection, text, **publish_kwargs)

        if result.get("processing"):
            return json_response(202, {"success": False, **result})

        # NEW — Facebook publish via Make.com is async: nothing has actually
        # posted yet at this point, so record "publishing" now and let
        # handle_facebook_publish_callback flip it to published/publish_failed.
        if platform == "facebook" and result.get("queued"):
            update_history_status(business_id, created_at, "publishing", post_id_field="facebookPostId")

        logger.info("publish: success platform=%s businessId=%s postId=%s", platform, business_id, result.get("postId"))
        return json_response(200, {"success": True, "postId": result.get("postId", "")})

    except ValueError as e:
        logger.error("handle_publish error: %s", str(e))
        return json_response(500, {"error": str(e)})
    except Exception as e:
        logger.error("handle_publish unhandled error: %s", str(e))
        return json_response(500, {"error": f"Unexpected error: {str(e)}"})


# Public endpoint — no JWT, since Make.com is calling it, not a logged-in
# user. Protected instead by the shared secret. Register this route at
# API Gateway WITHOUT a JWT authorizer, same as the OAuth callback routes
# in social_auth handler.
def handle_facebook_publish_callback(event):
    try:
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        if body.get("secret") != MAKE_WEBHOOK_SECRET:
            logger.warning("facebook publish callback: bad secret")
            return json_response(403, {"error": "Invalid secret"})

        request_id  = body.get("requestId")
        business_id = body.get("businessId")
        created_at  = body.get("createdAt")
        page_id     = body.get("pageId")
        success     = bool(body.get("success"))
        post_id     = body.get("postId")
        error       = body.get("error")

        if success:
            logger.info(
                "facebook publish result: SUCCESS requestId=%s businessId=%s pageId=%s postId=%s",
                request_id, business_id, page_id, post_id,
            )
        else:
            logger.error(
                "facebook publish result: FAILED requestId=%s businessId=%s pageId=%s error=%s",
                request_id, business_id, page_id, error,
            )

        update_history_status(
            business_id,
            created_at,
            "published" if success else "publish_failed",
            post_id=post_id,
            post_id_field="facebookPostId",
        )

        return json_response(200, {"received": True})

    except Exception as e:
        logger.error("handle_facebook_publish_callback error: %s", str(e))
        return json_response(500, {"error": str(e)})

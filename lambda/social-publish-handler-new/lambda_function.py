import json
import os
import logging
import boto3

from adapters.facebook import FacebookAdapter
from adapters.instagram import InstagramAdapter
from adapters.linkedin import LinkedInAdapter

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
connections_table = dynamodb.Table("social-connections")

S3_BUCKET_NAME = os.environ["S3_BUCKET_NAME"]
s3_client = boto3.client("s3", region_name="us-east-2")

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

# platform -> adapter instance. Adding a platform later = one new adapter file
# + one new entry here + one new route, no other router changes.
ADAPTERS = {
    "facebook": FacebookAdapter(s3_client, S3_BUCKET_NAME),
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

        if not text and not image_key and not video_key:
            return json_response(400, {"error": "At least one of text, image_key, or video_key is required"})

        connection = get_connection(business_id, platform, connection_id)
        if not connection:
            return json_response(400, {"error": f"{platform} not connected for this business"})

        adapter = ADAPTERS[platform]
        logger.info("publish: platform=%s businessId=%s userId=%s image_key=%s video_key=%s has_text=%s",
                    platform, business_id, sub, image_key, video_key, bool(text))

        result = adapter.publish(connection, text, image_key=image_key, video_key=video_key)

        if result.get("processing"):
            return json_response(202, {"success": False, **result})

        logger.info("publish: success platform=%s businessId=%s postId=%s", platform, business_id, result.get("postId"))
        return json_response(200, {"success": True, "postId": result.get("postId", "")})

    except ValueError as e:
        logger.error("handle_publish error: %s", str(e))
        return json_response(500, {"error": str(e)})
    except Exception as e:
        logger.error("handle_publish unhandled error: %s", str(e))
        return json_response(500, {"error": f"Unexpected error: {str(e)}"})

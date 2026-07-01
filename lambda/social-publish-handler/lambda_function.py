import json
import os
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table("social-connections")

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
    """POST JSON to LinkedIn, return (response_body_dict, headers_list)."""
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
        headers = resp.getheaders()  # list of (name, value) tuples
        body_str = raw.decode("utf-8") if raw else "{}"
        try:
            return json.loads(body_str), headers
        except Exception:
            return {}, headers


def get_header(headers: list, name: str) -> str:
    """Case-insensitive header lookup from list of (name, value) tuples."""
    name_lower = name.lower()
    for k, v in headers:
        if k.lower() == name_lower:
            return v
    return ""


# ── Router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "POST" and path == "/social/linkedin/publish":
        return handle_publish(event)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── POST /social/linkedin/publish ─────────────────────────────────────────────

def handle_publish(event):
    try:
        sub = get_sub_from_claims(event)
        if not sub:
            return json_response(400, {"error": "User not authenticated"})

        # Parse request body
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        text = body.get("text", "")
        image_key = body.get("image_key") or body.get("s3_key")

        if not text and not image_key:
            return json_response(400, {"error": "At least one of text or image_key is required"})

        # Get LinkedIn connection from DynamoDB
        result = table.get_item(Key={"businessId": sub, "platform": "linkedin"})
        item = result.get("Item")
        if not item:
            return json_response(400, {"error": "LinkedIn not connected. Please connect LinkedIn in Account Settings."})

        access_token = item.get("accessToken")
        linkedin_person_id = item.get("linkedinPersonId")
        if not access_token or not linkedin_person_id:
            return json_response(400, {"error": "LinkedIn connection is incomplete. Please reconnect."})

        author_urn = f"urn:li:person:{linkedin_person_id}"
        logger.info("publish: author=%s image_key=%s has_text=%s", author_urn, image_key, bool(text))

        # ── Image post ────────────────────────────────────────────────────────
        if image_key:
            # 1. Download image from S3
            s3_obj = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=image_key)
            image_binary = s3_obj["Body"].read()
            content_type = s3_obj.get("ContentType", "image/png")
            logger.info("publish: downloaded image from S3, size=%d bytes", len(image_binary))

            # 2. Initialize LinkedIn image upload
            try:
                init_body, _ = linkedin_post_json(
                    "https://api.linkedin.com/rest/images?action=initializeUpload",
                    access_token,
                    {"initializeUploadRequest": {"owner": author_urn}},
                )
            except HTTPError as e:
                detail = read_http_error(e)
                logger.error("initializeUpload failed: %s %s", e.code, detail)
                return json_response(500, {"error": f"LinkedIn image upload init failed (HTTP {e.code})", "detail": detail})

            upload_url = init_body.get("value", {}).get("uploadUrl")
            image_urn = init_body.get("value", {}).get("image")
            if not upload_url or not image_urn:
                logger.error("initializeUpload bad response: %s", init_body)
                return json_response(500, {"error": "LinkedIn did not return upload URL", "detail": str(init_body)})

            logger.info("publish: got uploadUrl and image_urn=%s", image_urn)

            # 3. PUT image binary to LinkedIn's upload URL (pre-signed, no auth needed)
            put_req = Request(
                upload_url,
                data=image_binary,
                headers={"Content-Type": content_type},
                method="PUT",
            )
            try:
                with urlopen(put_req) as put_resp:
                    logger.info("publish: image uploaded, status=%s", put_resp.status)
            except HTTPError as e:
                detail = read_http_error(e)
                logger.error("image PUT failed: %s %s", e.code, detail)
                return json_response(500, {"error": f"LinkedIn image upload failed (HTTP {e.code})", "detail": detail})

            # 4. Create post with image
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

        # ── Text-only post ────────────────────────────────────────────────────
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

        # 5. Create the LinkedIn post
        try:
            _, resp_headers = linkedin_post_json(
                "https://api.linkedin.com/rest/posts",
                access_token,
                post_payload,
            )
        except HTTPError as e:
            detail = read_http_error(e)
            logger.error("post creation failed: %s %s", e.code, detail)
            return json_response(500, {"error": f"LinkedIn post creation failed (HTTP {e.code})", "detail": detail})

        post_id = get_header(resp_headers, "x-restli-id")
        logger.info("publish: post created successfully post_id=%s", post_id)
        return json_response(200, {"success": True, "postId": post_id})

    except Exception as e:
        logger.error("handle_publish unhandled error: %s", str(e))
        return json_response(500, {"error": f"Unexpected error: {str(e)}"})
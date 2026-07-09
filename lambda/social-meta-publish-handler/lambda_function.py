import json
import os
import time
import uuid
import logging
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table("social-connections")

S3_BUCKET_NAME = os.environ["S3_BUCKET_NAME"]
s3_client = boto3.client("s3", region_name="us-east-2")

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


def build_multipart(boundary: str, fields: dict, file_field: str, filename: str,
                    file_content_type: str, file_data: bytes) -> bytes:
    """Build a multipart/form-data body from text fields and one binary file."""
    body = b""
    for name, value in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        body += f"{value}\r\n".encode()
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode()
    body += f"Content-Type: {file_content_type}\r\n\r\n".encode()
    body += file_data
    body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body


# ── Router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    path = strip_stage_prefix(raw_path)

    logger.info("method=%s stripped_path=%s raw_path=%s", method, path, raw_path)

    if method == "OPTIONS":
        return json_response(200, {})

    if method == "POST" and path == "/social/meta/publish":
        return handle_publish(event)

    if method == "POST" and path == "/social/meta/instagram/publish":
        return handle_instagram_publish(event)

    return json_response(404, {"error": "Route not found", "path": path, "method": method})


# ── POST /social/meta/publish ─────────────────────────────────────────────────

def handle_publish(event):
    try:
        sub = get_sub_from_claims(event)
        if not sub:
            return json_response(400, {"error": "User not authenticated"})

        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        text = body.get("text", "")
        image_key = body.get("image_key")

        if not text and not image_key:
            return json_response(400, {"error": "At least one of text or image_key is required"})

        # Get Facebook connection from DynamoDB
        result = table.get_item(Key={"businessId": sub, "platform": "facebook"})
        item = result.get("Item")
        if not item:
            return json_response(400, {"error": "Facebook not connected"})

        page_access_token = item.get("pageAccessToken")
        page_id = item.get("pageId")
        if not page_access_token or not page_id:
            return json_response(400, {"error": "Facebook connection is incomplete. Please reconnect."})

        logger.info("publish: pageId=%s image_key=%s has_text=%s", page_id, image_key, bool(text))

        # ── Image post ────────────────────────────────────────────────────────
        if image_key:
            s3_obj = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=image_key)
            image_binary = s3_obj["Body"].read()
            content_type = s3_obj.get("ContentType", "image/jpeg")
            logger.info("publish: downloaded image from S3, size=%d bytes", len(image_binary))

            boundary = f"----FormBoundary{uuid.uuid4().hex}"
            fields = {"access_token": page_access_token}
            if text:
                fields["message"] = text

            multipart_body = build_multipart(
                boundary=boundary,
                fields=fields,
                file_field="source",
                filename="image.jpg",
                file_content_type=content_type,
                file_data=image_binary,
            )

            photo_url = f"https://graph.facebook.com/v19.0/{page_id}/photos"
            photo_req = Request(
                photo_url,
                data=multipart_body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                method="POST",
            )
            try:
                with urlopen(photo_req) as resp:
                    photo_resp = json.loads(resp.read().decode())
            except HTTPError as e:
                detail = read_http_error(e)
                logger.error("photos upload failed: %s %s", e.code, detail)
                return json_response(500, {
                    "error": f"Facebook photo upload failed (HTTP {e.code})",
                    "detail": detail,
                })

            post_id = photo_resp.get("post_id") or photo_resp.get("id", "")
            logger.info("publish: photo post created successfully post_id=%s", post_id)
            return json_response(200, {"success": True, "postId": post_id})

        # ── Text-only post ────────────────────────────────────────────────────
        else:
            feed_url = f"https://graph.facebook.com/v19.0/{page_id}/feed"
            feed_body = json.dumps({"message": text, "access_token": page_access_token}).encode()
            feed_req = Request(
                feed_url,
                data=feed_body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlopen(feed_req) as resp:
                    feed_resp = json.loads(resp.read().decode())
            except HTTPError as e:
                detail = read_http_error(e)
                logger.error("feed post failed: %s %s", e.code, detail)
                return json_response(500, {
                    "error": f"Facebook feed post failed (HTTP {e.code})",
                    "detail": detail,
                })

            post_id = feed_resp.get("id", "")
            logger.info("publish: text post created successfully post_id=%s", post_id)
            return json_response(200, {"success": True, "postId": post_id})

    except Exception as e:
        logger.error("handle_publish unhandled error: %s", str(e))
        return json_response(500, {"error": f"Unexpected error: {str(e)}"})


# ── POST /social/meta/instagram/publish ─────────────────────────────────────

# API Gateway / Lambda have a hard ~30s response ceiling here, so video
# processing is polled best-effort within that budget rather than async.
IG_POLL_INTERVAL_SECONDS = 3
IG_POLL_BUDGET_SECONDS = 22


def graph_post_json(url: str, payload: dict) -> dict:
    data = urlencode(payload).encode()
    with urlopen(Request(url, data=data, method="POST")) as resp:
        return json.loads(resp.read().decode())


def graph_get_json(url: str) -> dict:
    with urlopen(Request(url, method="GET")) as resp:
        return json.loads(resp.read().decode())


def handle_instagram_publish(event):
    try:
        sub = get_sub_from_claims(event)
        if not sub:
            return json_response(400, {"error": "User not authenticated"})

        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        text = body.get("text", "")
        image_key = body.get("image_key")
        video_key = body.get("video_key")

        if not image_key and not video_key:
            return json_response(400, {"error": "Instagram requires an image_key or video_key"})

        # Get Instagram connection from DynamoDB (created alongside the Facebook
        # connection in social-meta-handler — same Page Access Token is reused)
        result = table.get_item(Key={"businessId": sub, "platform": "instagram"})
        item = result.get("Item")
        if not item:
            return json_response(400, {"error": "Instagram not connected. Connect Facebook in Account Settings first."})

        access_token = item.get("pageAccessToken")
        ig_user_id = item.get("instagramBusinessAccountId")
        if not access_token or not ig_user_id:
            return json_response(400, {"error": "Instagram connection is incomplete. Please reconnect Facebook."})

        media_key = video_key or image_key
        media_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET_NAME, "Key": media_key},
            ExpiresIn=3600,
        )
        logger.info("ig_publish: igUserId=%s media_key=%s is_video=%s", ig_user_id, media_key, bool(video_key))

        # ── Step 1: create media container ────────────────────────────────
        container_payload = {"access_token": access_token}
        if text:
            container_payload["caption"] = text

        if video_key:
            container_payload["video_url"] = media_url
            container_payload["media_type"] = "REELS"
        else:
            container_payload["image_url"] = media_url

        try:
            container_resp = graph_post_json(
                f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
                container_payload,
            )
        except HTTPError as e:
            detail = read_http_error(e)
            logger.error("ig media container failed: %s %s", e.code, detail)
            return json_response(500, {"error": f"Instagram media container failed (HTTP {e.code})", "detail": detail})

        creation_id = container_resp.get("id")
        if not creation_id:
            logger.error("ig media container bad response: %s", container_resp)
            return json_response(500, {"error": "Instagram did not return a media container id", "detail": str(container_resp)})

        # ── Step 2 (video only): poll until processing finishes, best-effort ──
        if video_key:
            deadline = time.monotonic() + IG_POLL_BUDGET_SECONDS
            status_code = "IN_PROGRESS"
            while time.monotonic() < deadline:
                status_url = (
                    f"https://graph.facebook.com/v19.0/{creation_id}?"
                    + urlencode({"fields": "status_code", "access_token": access_token})
                )
                try:
                    status_resp = graph_get_json(status_url)
                except HTTPError as e:
                    detail = read_http_error(e)
                    logger.error("ig status poll failed: %s %s", e.code, detail)
                    return json_response(500, {"error": f"Instagram status check failed (HTTP {e.code})", "detail": detail})

                status_code = status_resp.get("status_code", "IN_PROGRESS")
                logger.info("ig_publish: creation_id=%s status_code=%s", creation_id, status_code)

                if status_code == "FINISHED":
                    break
                if status_code in ("ERROR", "EXPIRED"):
                    return json_response(500, {"error": f"Instagram video processing failed (status={status_code})"})

                time.sleep(IG_POLL_INTERVAL_SECONDS)

            if status_code != "FINISHED":
                return json_response(202, {
                    "success": False,
                    "processing": True,
                    "error": "Instagram is still processing this video. Please try publishing again in a moment.",
                    "creationId": creation_id,
                })

        # ── Step 3: publish the container ───────────────────────────────────
        try:
            publish_resp = graph_post_json(
                f"https://graph.facebook.com/v19.0/{ig_user_id}/media_publish",
                {"creation_id": creation_id, "access_token": access_token},
            )
        except HTTPError as e:
            detail = read_http_error(e)
            logger.error("ig media_publish failed: %s %s", e.code, detail)
            return json_response(500, {"error": f"Instagram publish failed (HTTP {e.code})", "detail": detail})

        post_id = publish_resp.get("id", "")
        logger.info("ig_publish: published successfully post_id=%s", post_id)
        return json_response(200, {"success": True, "postId": post_id})

    except Exception as e:
        logger.error("handle_instagram_publish unhandled error: %s", str(e))
        return json_response(500, {"error": f"Unexpected error: {str(e)}"})

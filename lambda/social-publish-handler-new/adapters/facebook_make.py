"""
adapters/facebook_make.py

Facebook publishing routed through a Make.com webhook instead of calling
the Graph API directly. Same public interface as adapters/facebook.py
(publish(connection, text, image_key, video_key) -> dict plus an extra
optional created_at kwarg, unused here), so swapping it in is a one-line
change in the router — nothing else in the app, and nothing in the
scheduler Lambda, needs to know the underlying implementation changed.

Payload contract: {"secret", "message", "businessId", "imageUrl"} —
"imageUrl" is omitted entirely (not sent as empty/null) for text-only
posts, since the Make.com scenario routes solely on whether that key is
present at all. "businessId" (this app's own tenant ID, the
social-connections partition key) is always included so Make.com's
scenario can route to the Facebook Page connected for that business.
The webhook call is synchronous: Make.com's scenario responds with the
real Facebook postId via a "Webhook Response" module, so publish() here
returns {"postId": ...} immediately, matching InstagramAdapter and
LinkedInAdapter's return shape exactly.
"""

import json
import logging
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import os

from .base import SocialPublishAdapter

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def publish_to_make(text: str, image_url: str = None, business_id: str = None) -> dict:
    webhook_url = os.environ["MAKE_WEBHOOK_URL"]
    webhook_secret = os.environ["MAKE_WEBHOOK_SECRET"]

    payload = {"secret": webhook_secret, "message": text, "businessId": business_id}
    if image_url:
        payload["imageUrl"] = image_url

    data = json.dumps(payload).encode("utf-8")
    req = Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        # Must stay below the Lambda's own configured Timeout (60s), or AWS
        # kills the function first and this timeout never gets a chance to
        # raise a clean error.
        with urlopen(req, timeout=45) as resp:
            status = resp.status
            body_raw = resp.read().decode("utf-8")
    except HTTPError as e:
        detail = e.read().decode("utf-8") if e.fp else str(e)
        logger.error("make.com webhook call failed: status=%s detail=%s", e.code, detail)
        raise ValueError(f"Make.com webhook call failed (HTTP {e.code}): {detail}")

    logger.info("make.com webhook responded: status=%s body=%s", status, body_raw)

    try:
        resp_body = json.loads(body_raw) if body_raw else {}
    except json.JSONDecodeError:
        resp_body = {}

    return {"postId": resp_body.get("postId", "")}


class FacebookMakeAdapter(SocialPublishAdapter):
    def __init__(self, s3_client, bucket_name):
        self.s3_client = s3_client
        self.bucket_name = bucket_name

    def publish(self, connection: dict, text: str, image_key: str = None, video_key: str = None, created_at: str = None) -> dict:
        business_id = connection.get("businessId")

        media_key = video_key or image_key
        image_url = None
        if media_key:
            image_url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": media_key},
                ExpiresIn=3600,
            )

        return publish_to_make(text, image_url, business_id)

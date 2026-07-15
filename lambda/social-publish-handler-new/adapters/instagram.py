import json
import time
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError

from .base import SocialPublishAdapter

GRAPH_VERSION = "v19.0"

# API Gateway/Lambda have a hard ~30s response ceiling, so video processing is
# polled best-effort within that budget rather than async (matches the
# existing live social-meta-publish-handler's Instagram implementation).
IG_POLL_INTERVAL_SECONDS = 3
IG_POLL_BUDGET_SECONDS = 22


class InstagramAdapter(SocialPublishAdapter):
    def __init__(self, s3_client, bucket_name):
        self.s3_client = s3_client
        self.bucket_name = bucket_name

    def publish(self, connection: dict, text: str, image_key: str = None, video_key: str = None) -> dict:
        access_token = connection.get("pageAccessToken")
        ig_user_id = connection.get("instagramBusinessAccountId")
        if not access_token or not ig_user_id:
            raise ValueError("Instagram connection is incomplete")
        if not image_key and not video_key:
            raise ValueError("Instagram requires an image_key or video_key")

        media_key = video_key or image_key
        media_url = self.s3_client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket_name, "Key": media_key}, ExpiresIn=3600,
        )

        container_payload = {"access_token": access_token}
        if text:
            container_payload["caption"] = text
        if video_key:
            container_payload["video_url"] = media_url
            container_payload["media_type"] = "REELS"
        else:
            container_payload["image_url"] = media_url

        container_resp = self._post_json(
            f"https://graph.facebook.com/{GRAPH_VERSION}/{ig_user_id}/media", container_payload
        )
        creation_id = container_resp.get("id")
        if not creation_id:
            raise ValueError(f"Instagram did not return a media container id: {container_resp}")

        # Both photos and video need this wait — publishing immediately after
        # container creation intermittently fails with "Media ID is not
        # available" (code 9007) otherwise. Photos finish faster, shorter poll.
        poll_interval = IG_POLL_INTERVAL_SECONDS if video_key else 1.5
        deadline = time.monotonic() + IG_POLL_BUDGET_SECONDS
        status_code = "IN_PROGRESS"
        while time.monotonic() < deadline:
            status_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{creation_id}?" + urlencode({
                "fields": "status_code", "access_token": access_token
            })
            status_resp = self._get_json(status_url)
            status_code = status_resp.get("status_code", "IN_PROGRESS")
            if status_code == "FINISHED":
                break
            if status_code in ("ERROR", "EXPIRED"):
                media_kind = "video" if video_key else "image"
                raise ValueError(f"Instagram {media_kind} processing failed (status={status_code})")
            time.sleep(poll_interval)

        if status_code != "FINISHED":
            media_kind = "video" if video_key else "image"
            return {
                "processing": True,
                "creationId": creation_id,
                "error": f"Instagram is still processing this {media_kind}. Please try publishing again in a moment.",
            }

        publish_resp = self._post_json(
            f"https://graph.facebook.com/{GRAPH_VERSION}/{ig_user_id}/media_publish",
            {"creation_id": creation_id, "access_token": access_token},
        )
        return {"postId": publish_resp.get("id", "")}

    @staticmethod
    def _post_json(url, payload):
        data = urlencode(payload).encode()
        try:
            with urlopen(Request(url, data=data, method="POST")) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            detail = e.read().decode("utf-8") if e.fp else str(e)
            raise ValueError(f"Instagram API error (HTTP {e.code}): {detail}")

    @staticmethod
    def _get_json(url):
        try:
            with urlopen(Request(url, method="GET")) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            detail = e.read().decode("utf-8") if e.fp else str(e)
            raise ValueError(f"Instagram API error (HTTP {e.code}): {detail}")

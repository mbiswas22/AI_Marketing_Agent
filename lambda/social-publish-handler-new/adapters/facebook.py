import json
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from .base import SocialPublishAdapter

# Matches the existing live social-meta-publish-handler exactly — v19.0, not
# the v20.0 used by MarketingContentWorker (per Phase 3 requirements).
GRAPH_VERSION = "v19.0"


class FacebookAdapter(SocialPublishAdapter):
    def __init__(self, s3_client, bucket_name):
        self.s3_client = s3_client
        self.bucket_name = bucket_name

    def publish(self, connection: dict, text: str, image_key: str = None, video_key: str = None) -> dict:
        page_access_token = connection.get("pageAccessToken")
        page_id = connection.get("pageId")
        if not page_access_token or not page_id:
            raise ValueError("Facebook connection is incomplete")

        if image_key:
            s3_obj = self.s3_client.get_object(Bucket=self.bucket_name, Key=image_key)
            image_binary = s3_obj["Body"].read()
            content_type = s3_obj.get("ContentType", "image/jpeg")

            boundary = f"----FormBoundary{uuid.uuid4().hex}"
            fields = {"access_token": page_access_token}
            if text:
                fields["message"] = text

            body = self._build_multipart(boundary, fields, "source", "image.jpg", content_type, image_binary)
            url = f"https://graph.facebook.com/{GRAPH_VERSION}/{page_id}/photos"
            req = Request(
                url, data=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                method="POST",
            )
            resp = self._call(req)
            post_id = resp.get("post_id") or resp.get("id", "")
        else:
            url = f"https://graph.facebook.com/{GRAPH_VERSION}/{page_id}/feed"
            body = json.dumps({"message": text, "access_token": page_access_token}).encode()
            req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            resp = self._call(req)
            post_id = resp.get("id", "")

        return {"postId": post_id}

    @staticmethod
    def _build_multipart(boundary, fields, file_field, filename, file_content_type, file_data):
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

    @staticmethod
    def _call(req):
        try:
            with urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            detail = e.read().decode("utf-8") if e.fp else str(e)
            raise ValueError(f"Facebook API error (HTTP {e.code}): {detail}")

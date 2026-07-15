import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from .base import SocialPublishAdapter

# Exact 6-digit string, confirmed by the user against the live deployed value
# — never reformat or zero-pad this.
LINKEDIN_VERSION = "202606"


class LinkedInAdapter(SocialPublishAdapter):
    def __init__(self, s3_client, bucket_name):
        self.s3_client = s3_client
        self.bucket_name = bucket_name

    def publish(self, connection: dict, text: str, image_key: str = None, video_key: str = None) -> dict:
        access_token = connection.get("accessToken")
        linkedin_person_id = connection.get("linkedinPersonId")
        if not access_token or not linkedin_person_id:
            raise ValueError("LinkedIn connection is incomplete")

        author_urn = f"urn:li:person:{linkedin_person_id}"

        if image_key:
            s3_obj = self.s3_client.get_object(Bucket=self.bucket_name, Key=image_key)
            image_binary = s3_obj["Body"].read()
            content_type = s3_obj.get("ContentType", "image/png")

            init_body, _ = self._post_json(
                "https://api.linkedin.com/rest/images?action=initializeUpload",
                access_token,
                {"initializeUploadRequest": {"owner": author_urn}},
            )
            upload_url = init_body.get("value", {}).get("uploadUrl")
            image_urn = init_body.get("value", {}).get("image")
            if not upload_url or not image_urn:
                raise ValueError(f"LinkedIn did not return upload URL: {init_body}")

            put_req = Request(upload_url, data=image_binary, headers={"Content-Type": content_type}, method="PUT")
            try:
                with urlopen(put_req):
                    pass
            except HTTPError as e:
                detail = e.read().decode("utf-8") if e.fp else str(e)
                raise ValueError(f"LinkedIn image upload failed (HTTP {e.code}): {detail}")

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

        _, resp_headers = self._post_json("https://api.linkedin.com/rest/posts", access_token, post_payload)
        post_id = self._get_header(resp_headers, "x-restli-id")
        return {"postId": post_id}

    @staticmethod
    def _post_json(url, access_token, body):
        data = json.dumps(body).encode("utf-8")
        req = Request(
            url, data=data,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "LinkedIn-Version": LINKEDIN_VERSION,
                "X-Restli-Protocol-Version": "2.0.0",
            },
            method="POST",
        )
        try:
            with urlopen(req) as resp:
                raw = resp.read()
                headers = resp.getheaders()
                body_str = raw.decode("utf-8") if raw else "{}"
                try:
                    return json.loads(body_str), headers
                except Exception:
                    return {}, headers
        except HTTPError as e:
            detail = e.read().decode("utf-8") if e.fp else str(e)
            raise ValueError(f"LinkedIn API error (HTTP {e.code}): {detail}")

    @staticmethod
    def _get_header(headers, name):
        name_lower = name.lower()
        for k, v in headers:
            if k.lower() == name_lower:
                return v
        return ""

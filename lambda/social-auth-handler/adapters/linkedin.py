import json
import os
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode

from .base import SocialAuthAdapter


class LinkedInAdapter(SocialAuthAdapter):
    def __init__(self):
        self.client_id = os.environ["LINKEDIN_CLIENT_ID"]
        self.client_secret = os.environ["LINKEDIN_CLIENT_SECRET"]

    def get_authorize_url(self, redirect_uri: str, state: str) -> str:
        params = urlencode({
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": "openid profile w_member_social",
        })
        return f"https://www.linkedin.com/oauth/v2/authorization?{params}"

    def exchange_code_for_token(self, code: str, redirect_uri: str) -> dict:
        token_body = urlencode({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }).encode()
        token_req = Request(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data=token_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urlopen(token_req) as resp:
            token_resp = json.loads(resp.read().decode())

        access_token = token_resp.get("access_token")
        if not access_token:
            raise ValueError(f"token_exchange_failed: {token_resp}")
        expires_in = token_resp.get("expires_in", 5184000)
        refresh_token = token_resp.get("refresh_token")
        expires_at = int(datetime.now(timezone.utc).timestamp()) + expires_in

        userinfo_req = Request(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )
        with urlopen(userinfo_req) as resp:
            userinfo = json.loads(resp.read().decode())

        item = {
            "accessToken": access_token,
            "expiresAt": expires_at,
            "linkedinPersonId": userinfo.get("sub", ""),
            "linkedinName": userinfo.get("name", ""),
        }
        if refresh_token:
            item["refreshToken"] = refresh_token

        return {"linkedin": item}

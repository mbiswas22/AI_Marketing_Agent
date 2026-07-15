import json
import os
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode

from .base import SocialAuthAdapter

GRAPH_VERSION = "v19.0"


class MetaAdapter(SocialAuthAdapter):
    """Handles Facebook Page connect via Meta's Facebook Login for Business
    (config_id-based flow — required for Business-Portfolio-owned Pages, see
    SOCIAL_CONSOLIDATION_FINDINGS.md). Discovers the linked Instagram Business
    Account as part of the same flow — there is no separate Instagram OAuth."""

    def __init__(self):
        self.app_id = os.environ["META_APP_ID"]
        self.app_secret = os.environ["META_APP_SECRET"]
        self.config_id = os.environ["META_CONFIG_ID"]

    def get_authorize_url(self, redirect_uri: str, state: str) -> str:
        params = urlencode({
            "client_id": self.app_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "response_type": "code",
            "config_id": self.config_id,
        })
        return f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth?{params}"

    def exchange_code_for_token(self, code: str, redirect_uri: str) -> dict:
        short_token = self._exchange_short_lived(code, redirect_uri)
        long_token = self._exchange_long_lived(short_token)
        page = self._get_first_page(long_token)
        identity = self._get_identity(long_token)

        expires_at = int(datetime.now(timezone.utc).timestamp()) + 5184000  # 60 days

        result = {
            "facebook": {
                "userAccessToken": long_token,
                "pageAccessToken": page["access_token"],
                "pageId": page["id"],
                "pageName": page.get("name", ""),
                "facebookUserId": identity.get("id", ""),
                "facebookUserName": identity.get("name", ""),
                "expiresAt": expires_at,
            }
        }

        instagram_account = self._get_linked_instagram_account(page["id"], page["access_token"])
        if instagram_account:
            result["instagram"] = {
                "instagramBusinessAccountId": instagram_account,
                "pageAccessToken": page["access_token"],
                "pageId": page["id"],
                "pageName": page.get("name", ""),
                "expiresAt": expires_at,
            }

        return result

    def _exchange_short_lived(self, code: str, redirect_uri: str) -> str:
        url = f"https://graph.facebook.com/{GRAPH_VERSION}/oauth/access_token?" + urlencode({
            "client_id": self.app_id,
            "redirect_uri": redirect_uri,
            "client_secret": self.app_secret,
            "code": code,
        })
        with urlopen(Request(url, method="GET")) as resp:
            data = json.loads(resp.read().decode())
        token = data.get("access_token")
        if not token:
            raise ValueError(f"token_exchange_failed: {data}")
        return token

    def _exchange_long_lived(self, short_token: str) -> str:
        url = f"https://graph.facebook.com/{GRAPH_VERSION}/oauth/access_token?" + urlencode({
            "grant_type": "fb_exchange_token",
            "client_id": self.app_id,
            "client_secret": self.app_secret,
            "fb_exchange_token": short_token,
        })
        with urlopen(Request(url, method="GET")) as resp:
            data = json.loads(resp.read().decode())
        token = data.get("access_token")
        if not token:
            raise ValueError(f"token_exchange_failed: {data}")
        return token

    def _get_first_page(self, long_token: str) -> dict:
        url = f"https://graph.facebook.com/{GRAPH_VERSION}/me/accounts?" + urlencode({"access_token": long_token})
        with urlopen(Request(url, method="GET")) as resp:
            data = json.loads(resp.read().decode())
        pages = data.get("data", [])
        if not pages:
            raise ValueError("page_not_found")
        return pages[0]

    def _get_identity(self, long_token: str) -> dict:
        url = f"https://graph.facebook.com/{GRAPH_VERSION}/me?" + urlencode({
            "fields": "id,name", "access_token": long_token
        })
        with urlopen(Request(url, method="GET")) as resp:
            return json.loads(resp.read().decode())

    def _get_linked_instagram_account(self, page_id: str, page_access_token: str):
        try:
            url = f"https://graph.facebook.com/{GRAPH_VERSION}/{page_id}?" + urlencode({
                "fields": "instagram_business_account", "access_token": page_access_token
            })
            with urlopen(Request(url, method="GET")) as resp:
                data = json.loads(resp.read().decode())
            account = data.get("instagram_business_account")
            return account["id"] if account and account.get("id") else None
        except Exception:
            # Instagram linkage is a bonus, not required for Facebook connect to succeed
            return None

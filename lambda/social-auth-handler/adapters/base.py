class SocialAuthAdapter:
    """Interface every platform adapter implements. Adding a new platform later
    means writing one new adapter module with these two methods — no router
    changes."""

    def get_authorize_url(self, redirect_uri: str, state: str) -> str:
        raise NotImplementedError

    def exchange_code_for_token(self, code: str, redirect_uri: str) -> dict:
        """Returns {platform_name: {...fields to store on the connection item}}.
        Most adapters return exactly one key. The Meta adapter can return two
        (facebook + instagram) from a single OAuth exchange, since an Instagram
        Business Account is only ever accessible through its linked Facebook Page."""
        raise NotImplementedError

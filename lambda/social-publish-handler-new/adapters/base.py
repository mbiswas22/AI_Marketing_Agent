class SocialPublishAdapter:
    """Interface every platform publish adapter implements. Adding a platform
    later means one new adapter module — no router changes."""

    def publish(self, connection: dict, text: str, image_key: str = None, video_key: str = None) -> dict:
        """connection is the raw social-connections item (has the stored token
        and platform-specific account fields). Returns {"postId": ...} on
        success, or {"processing": True, "creationId": ..., "error": ...} for
        the Instagram still-processing case. Raises ValueError on hard API
        failure (caller turns that into a 500 with the message)."""
        raise NotImplementedError

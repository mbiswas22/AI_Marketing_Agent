# social-publish-handler-new

**Phase 3 of the social/scheduling consolidation** (see `SOCIAL_CONSOLIDATION_PLAN.md`). New Lambda, new routes — does not touch or replace the existing `social-meta-publish-handler` (Facebook+Instagram) or `social-publish-handler` (LinkedIn), which remain live and unmodified.

Named `social-publish-handler-new` rather than the plan's final intended name `social-publish-handler`, because that name is already taken by the existing live LinkedIn-only Lambda. Renamed at Phase 5 cutover, not before.

Publish for every platform via a shared adapter interface (`adapters/base.py`) — `adapters/facebook.py`, `adapters/instagram.py`, `adapters/linkedin.py`. Adding a platform later means one new adapter file, not a router change.

## Routes (test-only, under `/social-v2/`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/social-v2/meta/publish` | Cognito JWT, no role restriction |
| POST | `/social-v2/meta/instagram/publish` | Cognito JWT, no role restriction |
| POST | `/social-v2/linkedin/publish` | Cognito JWT, no role restriction |

Request body: `{"businessId": "...", "text": "...", "image_key": "..." | "video_key": "...", "connectionId": "primary"}` (`connectionId` optional, defaults to `"primary"`). `businessId` comes from the request, `userId` (for logging only, not authorization) from the JWT `sub` — no admin/role check, per Phase 3 requirements.

## Connection lookup

Reads `social-connections` by `businessId` + the real sort key attribute `platform`, whose *value* is the composite string `"{platform}#{connectionId}"` (e.g. `"facebook#primary"`) — same corrected key format fixed in Phase 2 after the `ValidationException` bug.

## Platform specifics

- **Facebook**: Graph API `v19.0` (matches the existing live `social-meta-publish-handler`, not the `v20.0` used by the old `MarketingContentWorker`). Text posts via `/{page_id}/feed`, image posts via `/{page_id}/photos` (multipart).
- **Instagram**: full implementation, not a mock — two-step container (`/media`) + publish (`/media_publish`) flow, with status polling before publish for **both** photos and video (the Phase-earlier-session fix for `"Media ID is not available"`, code 9007). Supports photo and Reels/video (`media_type=REELS`). Video polling budget ~22s to stay under the API Gateway timeout; returns `202 {"processing": true}` if still processing when the budget runs out, not a hang.
- **LinkedIn**: `LINKEDIN_VERSION = "202606"` exactly, hardcoded as the literal 6-digit string — never reformatted or zero-padded, per explicit confirmation this session.

## Environment variables

| Variable | Description |
|----------|-------------|
| `S3_BUCKET_NAME` | Same bucket as the existing publish handlers — `kushtest-marketing-ai-assets` |

No OAuth app credentials needed — publishing only uses tokens already stored on the `social-connections` item, never talks to Meta/LinkedIn's app-level OAuth endpoints.

## IAM

Reuses `invitation-handler-role-d63ugq9q` — same role as every other social Lambda. Confirmed (Phase 0) it already has everything needed: `AWSLambdaBasicExecutionRole`, `AmazonDynamoDBFullAccess`, and an inline `s3-marketing-assets-read` policy (`s3:GetObject`) for downloading images/video from S3. No new IAM resources needed.

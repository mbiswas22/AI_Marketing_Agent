# social-meta-handler

Handles Facebook Page OAuth and connection management via the Meta Graph API.
API Gateway id: `l9k0b4he7h`, region `us-east-2`.

## Routes

| Method | Path | Authorizer |
|--------|------|-----------|
| GET | /social/meta/authorize | Cognito JWT |
| GET | /social/meta/callback | PUBLIC (no authorizer) |
| GET | /social/meta/pages | Cognito JWT |
| DELETE | /social/connections/facebook | Cognito JWT |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `META_APP_ID` | Facebook App ID from Meta Developer Console |
| `META_APP_SECRET` | Facebook App Secret |
| `META_REDIRECT_URI` | OAuth callback URL pointing to this Lambda's `/social/meta/callback` route |
| `FRONTEND_URL` | Base URL of the frontend (e.g. `https://app.example.com`) — used for post-OAuth redirects |
| `META_CONFIG_ID` | Facebook Login for Business Configuration ID (App Dashboard → Facebook Login for Business → Configurations). Bundles the Pages asset type + permissions and drives the asset-picker consent screen — see note below |

## DynamoDB Schema

Table: `social-connections`

| Key | Type | Description |
|-----|------|-------------|
| `businessId` (PK) | String | Cognito `sub` from JWT |
| `platform` (SK) | String | `"facebook"` |
| `userAccessToken` | String | Long-lived (60-day) user access token — never returned to client |
| `pageAccessToken` | String | Page-scoped access token — never returned to client |
| `pageId` | String | Facebook Page ID |
| `pageName` | String | Human-readable page name |
| `facebookUserId` | String | Authenticated user's Facebook ID |
| `facebookUserName` | String | Authenticated user's display name |
| `connectedAt` | String | ISO-8601 timestamp, preserved on reconnect |
| `status` | String | `"connected"` |
| `expiresAt` | Number | Unix timestamp: `now + 5184000` (60 days) |

## OAuth flow: Facebook Login for Business (config_id)

`handle_authorize()` builds the OAuth URL with `config_id=<META_CONFIG_ID>` rather than a `scope=` param. This is Meta's required flow for Pages owned by a Business Portfolio (as opposed to a personal profile) — the Configuration bundles `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`, and drives an asset-picker consent screen where the connecting user explicitly selects which Page to share. The classic scope-based `/dialog/oauth` flow does **not** expose Business-Portfolio-owned Pages via `/me/accounts` — this was the root cause of a `page_not_found` failure during initial testing (confirmed via a direct Graph API Explorer call: `/me/accounts` returned `{"data": []}` even with all three permissions granted under the classic flow).

`pages_manage_posts` is required for the publish endpoint (`social-meta-publish-handler`) to post to the Page — without it, publish calls fail with a Graph API permissions error. Connections made before this Configuration existed only have the older, narrower token and must disconnect/reconnect via Settings.

## Page selection

`handle_callback()` takes the first Page returned by `/me/accounts` after the asset-picker consent and stores its `pageId`/`pageAccessToken`/`pageName` in DynamoDB under the connecting `businessId` — no hardcoded Page ID. This already supports different businesses connecting different Pages.

**Known follow-up**: if a business selects multiple Pages in the asset picker, only the first is used. A real page-picker UI (letting the user choose among multiple returned Pages) is not yet built.

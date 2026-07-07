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
| `FACEBOOK_PAGE_ID` | ID of the Facebook Page to post to (see note below) |

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

## Note on FACEBOOK_PAGE_ID

`FACEBOOK_PAGE_ID` is currently hardcoded as a Lambda environment variable, meaning all users of this deployment post to the same Facebook Page. This is intentional for the MVP.

In a future iteration this should be made dynamic per user: during the OAuth callback, instead of matching against a fixed ID, the user should be presented with a page-picker UI that lets them select which of their administered pages to connect. The selected `pageId` would then be stored in DynamoDB and looked up at publish time.

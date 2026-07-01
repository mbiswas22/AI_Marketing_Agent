# social-oauth-handler

Handles LinkedIn OAuth 2.0 connect/disconnect and social connection queries for the AI Marketing Hub.

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/social/linkedin/authorize` | Cognito JWT |
| GET | `/social/linkedin/callback` | Public (LinkedIn redirect) |
| GET | `/social/connections` | Cognito JWT |
| DELETE | `/social/connections/{platform}` | Cognito JWT |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINKEDIN_CLIENT_ID` | LinkedIn app client ID (from LinkedIn Developer Portal) |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `LINKEDIN_REDIRECT_URI` | Must exactly match the redirect URL registered in the LinkedIn app (e.g. `https://l9k0b4he7h.execute-api.us-east-2.amazonaws.com/dev/social/linkedin/callback`) |
| `FRONTEND_URL` | Base URL of the frontend (e.g. `https://main.d1234.amplifyapp.com`) — used to build the post-OAuth redirect |

## DynamoDB Table: `social-connections`

| Key | Type | Notes |
|-----|------|-------|
| `businessId` | String (PK) | Partition key |
| `platform` | String (SK) | Sort key — e.g. `"linkedin"` |
| `accessToken` | String | Never returned to the client |
| `refreshToken` | String | Optional — only present if LinkedIn returns one |
| `expiresAt` | Number | Unix epoch seconds |
| `linkedinPersonId` | String | `sub` from LinkedIn userinfo |
| `linkedinName` | String | `name` from LinkedIn userinfo |
| `connectedAt` | String | ISO 8601 — set once, preserved on re-connect |
| `status` | String | `"connected"` |

## ⚠️ Claim Key — Verify Before Deploy

`businessId` is read from the Cognito JWT claim `custom:businessId`. Confirm the exact key in CloudWatch logs (the handler logs all claim keys on every authorized request). If the Cognito attribute was defined differently, update `get_business_id_from_claims()` in `lambda_function.py`.

## Testing

```bash
# GET /social/connections — replace TOKEN with a valid Cognito ID token
curl -H "Authorization: Bearer TOKEN" \
  https://l9k0b4he7h.execute-api.us-east-2.amazonaws.com/dev/social/connections
```

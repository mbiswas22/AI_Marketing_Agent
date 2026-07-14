# social-auth-handler

**Phase 2 of the social/scheduling consolidation** (see `SOCIAL_CONSOLIDATION_PLAN.md` at repo root). New Lambda, new routes — does not touch or replace `social-meta-handler`/`social-oauth-handler`, which remain live and unmodified. Cutover to the real `/social/...` paths happens only in Phase 5, after explicit approval.

Connect/disconnect for every platform via a shared adapter interface (`adapters/base.py`) — one module per platform (`adapters/meta.py` for Facebook+Instagram, `adapters/linkedin.py` for LinkedIn). Adding a platform later means one new adapter file, not a router change.

## Routes (test-only, under `/social-v2/` — mirrors the real `/social/...` path shapes exactly so cutover is a pure repoint)

| Method | Path | Auth |
|--------|------|------|
| GET | `/social-v2/meta/authorize?businessId=...` | Cognito JWT, admin-only |
| GET | `/social-v2/meta/callback` | PUBLIC |
| GET | `/social-v2/meta/pages?businessId=...` | Cognito JWT, any role |
| GET | `/social-v2/meta/instagram?businessId=...` | Cognito JWT, any role |
| GET | `/social-v2/linkedin/authorize?businessId=...` | Cognito JWT, admin-only |
| GET | `/social-v2/linkedin/callback` | PUBLIC |
| GET | `/social-v2/connections?businessId=...` | Cognito JWT, any role |
| DELETE | `/social-v2/connections/{platform}?businessId=...&connectionId=primary` | Cognito JWT, admin-only |

`businessId` is always explicit — passed by the caller, never derived from JWT claims (see `SOCIAL_CONSOLIDATION_FINDINGS.md` §5 on why the `custom:businessId` claim isn't trusted).

## Admin check

Not the JWT's `custom:role` claim. `require_admin()` looks up the real `user` table (`businessId` from the request + `userId` = the JWT's `sub`) and checks `role == "ADMIN"` there — the canonical, confirmed-real role source.

## Environment variables

| Variable | Description |
|----------|-------------|
| `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` | Same Meta app as `social-meta-handler` — reused values |
| `META_REDIRECT_URI` | **New** — points at this Lambda's `/social-v2/meta/callback`, must be added as a valid OAuth redirect URI in the Meta App Dashboard before testing |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Same LinkedIn app as `social-oauth-handler` — reused values |
| `LINKEDIN_REDIRECT_URI` | **New** — points at this Lambda's `/social-v2/linkedin/callback`, must be added as a valid redirect URI in the LinkedIn app settings before testing |
| `FRONTEND_URL` | Same as the other social Lambdas — `https://master.d22giby4sl2grj.amplifyapp.com` |

## DynamoDB schema — `social-connections`

**Key changed from Phase 0/live**: `businessId` (PK) + `platform#connectionId` (SK, e.g. `"facebook#primary"`), not just `businessId`+`platform`. `connectionId` defaults to `"primary"`. See `SOCIAL_CONSOLIDATION_PLAN.md` §1 for the full item shape and the reasoning (supports multiple connections per platform per business, additive not breaking).

**This Lambda writes to the real `social-connections` table** (not a copy) — new rows use the new `platform#connectionId` SK format. The 3 existing rows (written by the still-live `social-meta-handler`/`social-oauth-handler`, SK = plain `platform`) are untouched by this Lambda and won't collide (different SK format = different items). Migrating those 3 rows to the new format is a Phase 5 step, not done here.

## IAM

Reuses `invitation-handler-role-d63ugq9q` — the same execution role already attached to the live `social-meta-handler`/`social-oauth-handler` (confirmed via `aws lambda get-function-configuration`). Attaching an existing role to a new function doesn't modify the role or affect anything currently using it. No Lambda layer attached — `require_admin()` is self-contained (queries the `user` table directly) rather than importing the shared `auth.py`, since that module reads role/businessId from JWT claims, which this Lambda deliberately doesn't trust (see admin-check note above).

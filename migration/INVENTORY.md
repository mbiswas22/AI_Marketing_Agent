# AI Marketing Hub — Source Account Inventory

Captured read-only from AWS account `849279003046` (CLI profile `kush`), primary region `us-east-2`, on 2026-07-17. This is a point-in-time record for your files — it is not consumed by any script. The scripts in this folder do their own live discovery/config reads at run time.

**Discovery method**: every command run to produce this document was read-only (`list-*`, `describe-*`, `get-*`, plus one Lambda source download via its own pre-signed `Code.Location` URL). Nothing in the source account was created, modified, or deleted while producing this file or the two migration scripts.

---

## Corrections found vs. the original migration brief

These were verified against the live account, not assumed from the brief:

1. **Bedrock text model is not "Nova Lite" and not in `us-east-2`.** The two content-generation Lambdas (`generate-marketing-asset`, `generate-caption`) both invoke Bedrock text models in **`us-east-1`**: `us.amazon.nova-pro-v1:0` (a cross-region inference profile ID, Nova *Pro*) and `amazon.nova-micro-v1:0` (Nova *Micro*) respectively. The image model, `stability.stable-image-ultra-v1:1`, is correctly in `us-west-2` as the brief said.
2. **`get_models` (the model-picker Lambda) queries Bedrock's catalog in a *third* region, `us-east-2`** — different again from where generation actually happens. This is a real, pre-existing cross-region mismatch: the dropdown can show a model that then fails when the generation Lambda tries to invoke it in a different region. Not fixed as part of this migration — flagged in `SETUP_GUIDE.md`.
3. The backend is 13 Lambdas, not 3 — the 3 named in the brief are the social/scheduling core, but 10 more Lambdas serve the rest of the app (users, businesses, invitations, content generation, history, crawler, email) and are wired into live, working API routes.
4. Two Lambdas were deliberately **excluded** after review: `social-publish-handler` (a teammate's older, superseded LinkedIn-only publish Lambda — still live but only triggered by the 14 legacy EventBridge Rules that are explicitly out of scope) and `MarketingContentWorker` (references a DynamoDB table, `SocialConnections`, that no longer exists in this account — confirmed broken/legacy).
5. Found 3 orphaned API Gateway integrations pointing at Lambdas already deleted in an earlier cleanup this session (`social-oauth-handler`, `social-meta-handler`, `social-meta-publish-handler`). No route references them. Not migrated — dead config in the source account only.

---

## Amplify (`us-east-1`)

| Field | Value |
|---|---|
| App ID | `d22giby4sl2grj` |
| App name | `AI_Marketing_Agent` |
| Repository | `https://github.com/mbiswas22/AI_Marketing_Agent` |
| Default domain | `d22giby4sl2grj.amplifyapp.com` |
| Connected branch | `master` only, stage `PRODUCTION`, auto-build enabled |
| Branch-level env vars | none set — the API base URL is **hardcoded** in `src/services/api.ts`, not read from an Amplify env var |
| Build spec | standard Vite: `npm ci` → `npm run build` → artifacts from `dist/` |

**Implication for migration**: pointing the new frontend at the new API Gateway URL requires either a source code change before deploy, or (recommended, not done here per "don't fix loose ends") refactoring `api.ts` to read `VITE_API_URL` from an env var. The setup guide covers the manual code-edit path since that's the no-code-change option.

## Cognito (`us-east-2`)

| Field | Value |
|---|---|
| User Pool | `MarketingAgentUserPool` (`us-east-2_lhZuTGjJM`) |
| App Client | `AIMarketingAgent` (`3untuo8qkqrnapqvb9kml02mg1`) — public client, no secret |
| Username | email, auto-verified |
| Password policy | min length 8, upper+lower+number required, symbols not required, history 5, temp password valid 7 days |
| MFA | off |
| Custom attributes | `custom:businessId`, `custom:role` — **confirmed unused** by any backend authorization check in this app; every real permission check queries the `user` DynamoDB table by Cognito `sub` instead. Recreated for schema parity only. |
| Groups | `ADMIN`, `EDITOR`, `VIEWER`, `SUPER_USER` — **`SUPER_USER` is also confirmed vestigial**, zero code references across all 13 in-scope Lambdas. |

**Stale Hosted-UI config observed, not carried over**: the real app client also has Cognito Hosted-UI OAuth settings (`AllowedOAuthFlows: [code]`, `CallbackURLs`/`LogoutURLs`) pointing at Amplify domains (`d7373n44j39n0.amplifyapp.com`, `d84l1y8p4kdic.cloudfront.net`) that don't match this project's actual Amplify app (`d22giby4sl2grj`) — leftover from an earlier iteration or a copy-paste from another project. The app itself authenticates via Amplify's direct SRP/password SDK (confirmed in `src/services/auth.ts` — `fetchAuthSession`/`fetchUserAttributes`/`getCurrentUser`, no Hosted-UI redirect flow anywhere in the codebase), so `create-destination.sh` deliberately creates the new app client without any Hosted-UI OAuth config rather than copying stale values forward.

## API Gateway HTTP API (`us-east-2`, `l9k0b4he7h`)

- Name `marketing-ai-api`, CORS wide open (`AllowOrigins: *`)
- One stage, `dev`, auto-deploy on
- One JWT authorizer, `cognito-jwt` (`cy5rh7`), audience = the app client above, issuer = the user pool above
- 44 routes total in the source account; roughly half are `/social-v2/...` — leftover test routes from an earlier consolidation project this session, all pointing at the same Lambdas as their real `/social/...` counterparts. **Not recreated** in the destination — only the real routes are.

### Real routes migrated (grouped by target Lambda)

| Lambda | Routes |
|---|---|
| `social-auth-handler` | `GET/DELETE /social/connections`, `DELETE /social/connections/{platform}`, `GET /social/meta/authorize`, `GET /social/meta/callback` (public), `GET /social/meta/pages`, `GET /social/meta/instagram`, `GET /social/linkedin/authorize`, `GET /social/linkedin/callback` (public) |
| `social-publish-handler-new` | `POST /social/meta/publish`, `POST /social/meta/instagram/publish`, `POST /social/linkedin/publish` |
| `marketing-scheduler` | `POST /schedule` |
| `user-handler` | `GET/POST /users`, `GET/PUT/DELETE /users/{userId}` |
| `business-management` | `GET/POST /business`, `PUT/DELETE /business/{businessId}` |
| `invitation-handler` | `GET/POST /invitations`, `GET/PUT /invitations/{invitationId}` |
| `generate-marketing-asset` | `POST /image` |
| `generate-caption` | `POST /generate` |
| `generate-flyer` | `POST /flyer` (public) |
| `get-history` | `GET /history` |
| `get_models` | `GET /models` (public) |
| `WebsiteCrawler` | `POST /crawl` (public) |
| `send-email` | `POST /send-email` |

## Lambda functions — 13 in scope (`us-east-2`, all `python3.12` except `WebsiteCrawler`)

| Function | Memory | Timeout | Runtime | Env vars (names only) |
|---|---|---|---|---|
| `social-auth-handler` | 128 | 30 | py3.12 | `FRONTEND_URL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`🔒, `LINKEDIN_REDIRECT_URI`, `META_APP_ID`, `META_APP_SECRET`🔒, `META_CONFIG_ID`, `META_REDIRECT_URI` |
| `social-publish-handler-new` | 128 | 30 | py3.12 | `S3_BUCKET_NAME` |
| `marketing-scheduler` | 256 | 60 | py3.12 | none — table names/region are Python constants in source |
| `user-handler` | 128 | 3 | py3.12 | `USER_TABLE` |
| `business-management` | 128 | 3 | py3.12 | `CHANNEL_TABLE`, `USER_TABLE`, `BUSINESS_TABLE`, `MODEL_TABLE`, `CONTENT_TYPE_TABLE` |
| `invitation-handler` | 128 | 30 | py3.12 | none |
| `generate-marketing-asset` | 512 | 60 | py3.12 | `S3_BUCKET`, `DYNAMO_TABLE` |
| `generate-caption` | 256 | 30 | py3.12 | `S3_BUCKET`, `TEXT_MODEL`, `DYNAMO_TABLE` |
| `generate-flyer` | 128 | 30 | py3.12 | `S3_BUCKET`, `DYNAMO_TABLE` |
| `get-history` | 128 | 3 | py3.12 | `S3_BUCKET`, `DYNAMO_TABLE` |
| `get_models` | 128 | 3 | py3.12 | none |
| `WebsiteCrawler` | 256 | 60 | **py3.14** | none |
| `send-email` | 128 | 3 | py3.12 | `SENDGRID_API_KEY`🔒, `DYNAMO_TABLE`, `FROM_EMAIL` |

🔒 = secret; redacted in the export, must be manually entered in the destination.

**`LINKEDIN_VERSION` note**: this is *not* a console-set env var on any currently-deployed Lambda — it's a hardcoded Python constant (`LINKEDIN_VERSION = "202606"`) inside `social-publish-handler-new`'s `adapters/linkedin.py` source, which is part of the exported code package. Called out explicitly so it's never silently lost on a future deploy.

**Excluded Lambdas** (confirmed out of scope): `social-publish-handler` (Anthony's legacy LinkedIn-only publisher), `MarketingContentWorker` (broken, references a nonexistent table).

## DynamoDB (`us-east-2`) — 14 tables, all `PAY_PER_REQUEST`, all in scope

| Table | Partition key | Sort key | GSIs |
|---|---|---|---|
| `Business` | `businessId` (S) | — | — |
| `user` | `businessId` (S) | `userId` (S) | `userId-index` (HASH `userId`) |
| `Channel` | `businessId` (S) | `channelName` (S) | — |
| `ContentType` | `businessId` (S) | `contentTypeName` (S) | — |
| `Model` | `businessId` (S) | `modelName` (S) | — |
| `invitation` | `invitationId` (S) | — | — |
| `ContentSchedules` | `schedule_id` (S) | — | `businessId-index`, `user_id-index` |
| `ScheduleLogs` | `log_id` (S) | — | `businessId-index`, `user_id-index` |
| `social-connections` | `businessId` (S) | `platform` (S) | — |
| `kushtest-MarketingActions` | `action_id` (S) | — | — |
| `AIMarketingHistory` | `userId` (S) | `createdAt` (S) | — |
| `Artifact` | `jobId` (S) | `artifactId` (S) | — |
| `AuditEvent` | `eventId` (S) | — | — |
| `Job` | `businessId` (S) | `jobId` (S) | — |

No table items/data are exported or migrated, per the no-data-migration rule — schemas only.

**Note on `AIMarketingHistory`**: its only known writer is `social-publish-handler`, which is excluded from this migration. It's still created in the destination (per your explicit choice) but will sit empty unless something else is later wired to it.

## S3

- In-scope bucket: `kushtest-marketing-ai-assets` (`us-east-2`) — CORS allows `http://localhost:5173` and `https://*.amplifyapp.com`; all 4 public-access-block flags on (fully private).
- Two other buckets exist in the account and are **not part of this project**: `cdk-hnb659fds-assets-849279003046-us-east-1` (CDK bootstrap bucket, unrelated), `marketing-ai-images-anth` (appears to be a teammate's personal test bucket).

## EventBridge (informational only — nothing here is migrated)

- 11 EventBridge Scheduler entries exist: 3 target `marketing-scheduler` (live per-user schedules — data, not infrastructure, never migrated), 8 target the excluded `MarketingContentWorker` (legacy debris).
- 14 classic EventBridge Rules, all targeting the excluded `social-publish-handler` — confirmed out of scope by you.
- What *does* carry over: the **IAM permissions** `marketing-scheduler`'s execution role needs to create/manage EventBridge Schedules at runtime (`scheduler:CreateSchedule`, `UpdateSchedule`, `DeleteSchedule`, `GetSchedule`, plus `iam:PassRole` on a scheduler-invoke role) — documented in `SETUP_GUIDE.md` as a manual IAM step, not scripted.

## Secrets identified (never exported with real values)

| Lambda | Env var |
|---|---|
| `social-auth-handler` | `LINKEDIN_CLIENT_SECRET`, `META_APP_SECRET` |
| `send-email` | `SENDGRID_API_KEY` |

Also relevant but not a Lambda env var: the Meta Developer App (ID `1019410487364707`, test Page ID `61585630559264`) and LinkedIn Developer App behind `LINKEDIN_CLIENT_ID`/`META_APP_ID` belong to the source account holder and do not transfer — the destination team registers their own.

## Known loose ends (carried into the handoff, not fixed)

- ~~`send-email`'s `DYNAMO_TABLE` env var was `"MarketingActions"` — no such table existed.~~ **Fixed 2026-07-20** in the source account: `DYNAMO_TABLE` updated to `kushtest-MarketingActions`, matching every other Lambda that touches this data (`generate-marketing-asset`, `generate-caption`, `generate-flyer`, `get-history`). Found by spot-checking a real export's output during migration validation, not part of the original brief. If you re-run `export-source.sh` now, the corrected value will be captured automatically — no script changes were needed.

- `Schedules.tsx`: `.toISOString()` produces UTC but is labeled/treated as local time when building `at()` schedule expressions — timezone display/behavior bug.
- `Schedules.tsx`: a `topic`/`input_value` column mismatch in the schedule list display.
- 14 legacy classic EventBridge Rules targeting `social-publish-handler` — source-account cruft, pending your own cleanup, not migrated.
- Meta OAuth Lambda logic was scoped but never fully built out.
- LinkedIn OAuth tokens have no refresh logic — they expire after ~60 days with no automatic renewal.
- `FRONTEND_URL` on `social-auth-handler` is currently `http://localhost:5173` in the source account — needs to point at the new Amplify domain once that exists (covered in the setup guide).
- `get_models`/generation Lambdas 3-way Bedrock region mismatch (`us-east-2` catalog query vs. `us-east-1`/`us-west-2` actual invocation) — see the Bedrock corrections section above.
- Amplify has no branch-level env vars — the API URL is hardcoded in frontend source, requiring a manual code edit (not an Amplify console change) to point at the new API.

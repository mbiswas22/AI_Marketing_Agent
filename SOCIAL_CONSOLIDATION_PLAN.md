# Social & Scheduling Lambda Consolidation — Phase 1 Design

Design only. No code written, no deploys, still on `Kush`, nothing pushed. Based on the confirmed evidence in `SOCIAL_CONSOLIDATION_FINDINGS.md` (read that first — this doc assumes its conclusions).

This project does not read, check out, diff against, or reference any teammate branch. Both previously-blocking design questions were resolved independently and are recorded as decisions below, not confirmations from anyone else.

---

## 1. `social-connections` — final schema

**Key**: `businessId` (PK) + `platform#connectionId` (SK, composite string, e.g. `"facebook#primary"`).

Decision (ours, independent of any teammate input): support more than one connection per platform per business from day one, via `connectionId` defaulting to the literal string `"primary"` for the common single-connection case. This keeps today's confirmed one-connection-per-platform behavior identical for every existing caller (nothing has to know `connectionId` exists to keep working), while making multi-connection support additive later — no breaking migration if/when a business needs to connect a second Facebook Page, for example.

Item shape:
```
businessId          (PK, S)   — real business ID, provided explicitly by the caller
platform#connectionId (SK, S) — e.g. "facebook#primary", "linkedin#primary"
platform             (S)      — denormalized, e.g. "facebook" (for readability / begins_with queries)
connectionId         (S)      — denormalized, "primary" unless multi-connection is used
status               (S)      — "connected"
connectedAt          (S, ISO-8601)
connectedByUserId    (S)      — Cognito sub of whoever connected it, audit only
expiresAt            (N, unix epoch, where applicable)
-- platform-specific fields, unchanged from what's already live today:
  facebook:  pageId, pageName, pageAccessToken, facebookUserId, facebookUserName, userAccessToken
  instagram: instagramBusinessAccountId, pageId, pageName, pageAccessToken (same token as facebook)
  linkedin:  linkedinPersonId, linkedinName, accessToken
```

**Migration note** (Phase 5, not now): the 3 rows live today have SK = plain `platform` (e.g. `"facebook"`), not `"facebook#primary"`. A one-time script to rewrite these 3 rows to the new SK format is needed during cutover so existing connections aren't orphaned — this directly answers open question #5 from the findings doc ("existing connections orphaned or reconnect acceptable") in favor of **migrate, don't orphan**, since it's a trivial 3-row rewrite.

---

## 2. `ContentSchedules` — final schema

**Key**: unchanged, `schedule_id` (PK). **GSI renamed**: `businessId-index` on `businessId` (replacing `user_id-index` — the real tenant identifier is `businessId`, not the creating user).

```
schedule_id          (PK, S)   — unchanged
schedule_name        (S)       — unchanged, "marketing-{schedule_id}"
businessId           (S)       — NEW. Explicit, from the caller, same convention as everywhere else
createdByUserId       (S)       — renamed from user_id; Cognito sub, audit only, not the tenant key
platform             (S)       — unchanged
connectionId         (S)       — NEW, defaults to "primary", which social-connections row to publish through
content_type         (S)       — unchanged
input_type           (S)       — NEW. "text" | "url" | "image" — matches generateMarketAsset's contract exactly
input_value          (S)       — NEW. The actual prompt / URL / S3 image key — matches generateMarketAsset's contract
business             (S)       — NEW. Business display name, matches generateMarketAsset's "business" param
modelId              (S, optional) — Bedrock model override, matches generateMarketAsset's "modelId" param
schedule_expression  (S)       — unchanged format, now genuinely supports at()/rate()/cron() (see §4)
timezone             (S)       — unchanged
status               (S)       — unchanged ("active"/"inactive")
last_run_status      (S)       — unchanged
last_run_at          (S)       — unchanged
created_at/updated_at (S)      — unchanged
```

`topic` (today's field, storing a bare string that in practice already contains full generated marketing copy, not a real short topic) is **removed**, replaced by `input_type`/`input_value`/`business`/`modelId` — the actual fields `generateMarketAsset` needs to regenerate fresh content from the same original input every time it fires, per the mission's core requirement ("every firing produces genuinely new content off the same original prompt, never reused").

`ScheduleLogs` gets the same treatment: add `businessId`, rename its GSI to `businessId-index`, keep everything else (`log_id` PK, `schedule_id`, `platform`, `status`, `message`, `response_data`, `created_at`) unchanged.

---

## 3. Frontend change needed — STOPPING HERE, not writing this

Per the mission's explicit instruction: since Phase 0 confirmed **zero existing scheduling frontend** (not a modification, a from-scratch build), here's the exact spec, for your approval before any of it becomes real code:

A "Create Schedule" form needs to collect:
- **platform** — dropdown, populated from `GET /social/connections` (only platforms the business has actually connected)
- **content_type** — dropdown, reusing the existing `CONTENT_TYPE_CATEGORY` options already used in `Dashboard.tsx`
- **input_type** + **input_value** — reuse the existing Dashboard input pattern exactly (text prompt / website URL / image upload tabs)
- **business** — reuse the business name already selected elsewhere in the app, not re-typed
- **modelId** — optional, default to the existing fallback model, same as Dashboard
- **schedule_expression** — a date/time picker for one-time posts, or a recurrence picker (daily/weekly/monthly + time-of-day) that gets translated into a `rate(...)`/`cron(...)` expression under the hood — user never types raw EventBridge syntax
- **timezone** — default to the browser's detected timezone, adjustable

`businessId` and `connectionId` are never user-entered — `businessId` comes from the logged-in user's current business context, `connectionId` defaults to `"primary"` silently until multi-connection UI is ever built.

**Not writing any of this until you explicitly approve it or tell me to proceed to Phase 4.**

---

## 4. Recurring schedules — the actual fix

`create_schedule()`/`update_schedule()` currently do:
```python
schedule_dt = datetime.datetime.fromisoformat(
    body["schedule_expression"].replace("at(", "").replace(")", "")
)
```
This only works for `at(...)`. Fix: branch on which prefix the expression uses before doing anything date-parsing-specific:
```python
expr = body["schedule_expression"]
if expr.startswith("at("):
    schedule_dt = datetime.datetime.fromisoformat(expr[3:-1])
    # role-based 1-day-ahead throttle check applies here only (one-time schedules)
elif expr.startswith("rate(") or expr.startswith("cron("):
    schedule_dt = None  # no single fire time to compare against — recurring
else:
    raise ValueError(f"Unrecognized schedule_expression format: {expr}")
```
EventBridge Scheduler's `create_schedule`/`update_schedule` API already natively accepts all three formats unchanged in `ScheduleExpression` — no translation needed there, only in our own validation/throttle logic that currently assumes a single parseable datetime exists.

The role-based 1-day-ahead throttle itself is **removed entirely** per the mission's confirmed decision (§ below) — so after that removal, the `at(...)` branch above doesn't even need the throttle check, just confirms the expression parses. Recurring (`rate`/`cron`) schedules simply skip any single-fire-time validation, since there isn't one.

---

## 5. Route map — all three lambdas

Existing paths are preserved exactly wherever possible, to avoid any unnecessary frontend churn beyond what's already flagged in §3.

### `social-auth-handler`
| Method | Path | Auth |
|---|---|---|
| GET | `/social/meta/authorize` | JWT, admin-only |
| GET | `/social/meta/callback` | public |
| GET | `/social/meta/pages` | JWT, any role |
| GET | `/social/meta/instagram` | JWT, any role |
| GET | `/social/linkedin/authorize` | JWT, admin-only |
| GET | `/social/linkedin/callback` | public |
| GET | `/social/connections` | JWT, any role |
| DELETE | `/social/connections/{platform}` | JWT, admin-only (operates on `connectionId="primary"` unless `?connectionId=` given) |
| DELETE | `/social/connections/facebook`, `/social/connections/instagram` | JWT, admin-only — thin aliases to the generic handler above, kept only so nothing in the frontend has to change |

Adding a future platform (e.g. YouTube) later = one new adapter file implementing `get_authorize_url`/`exchange_code_for_token`/`get_identity`, plus two new route entries — no router rewrite.

### `social-publish-handler`
| Method | Path | Auth |
|---|---|---|
| POST | `/social/meta/publish` | JWT, no role restriction |
| POST | `/social/meta/instagram/publish` | JWT, no role restriction |
| POST | `/social/linkedin/publish` | JWT, no role restriction |

Also directly invocable (Lambda-to-Lambda `invoke()`, `RequestResponse`) by `marketing-scheduler`, using a standardized internal payload shape (businessId, platform, connectionId, text, image_key/video_key) — **not** the legacy `action_id`/`ruleName` shape from the currently-undeployed classic-Rules mechanism in the live (not-in-git) `social-publish-handler`. That mechanism is confirmed test/debris (per findings §2 verification) and is not being ported forward — it's left behind with the old Lambda in Phase 6.

### `marketing-scheduler`
| Method | Path | Auth |
|---|---|---|
| POST | `/schedule` | **JWT (NEW — currently `NONE`)**, action-in-body dispatch |

Actions: `create_schedule`, `list_schedules`, `view_schedule`, `update_schedule`, `inactive_schedule`, `reactivate_schedule`, `delete_schedule`, `list_logs`. **`connect_social` is deleted entirely** — connecting only ever happens through `social-auth-handler` now.

Plus a second, non-HTTP entry point on the same Lambda — EventBridge Scheduler invokes it directly with `{"schedule_id": "..."}`, no `requestContext`, no `action` key. Dispatch logic:
```python
def lambda_handler(event, context):
    if "requestContext" not in event and "action" not in event and event.get("schedule_id"):
        return execute_schedule(event["schedule_id"])   # EventBridge-invoked path
    # else: normal API Gateway invocation, existing action-in-body convention
    ...
```

---

## 6. Admin-only check for `social-auth-handler`

- Extract `sub` from JWT claims — always present and reliable (every existing lambda already does this).
- Caller provides `businessId` explicitly (query param on GET, body on POST/DELETE) — same convention as `business-handler`/`invitation-handler`/`user-handler`, confirmed in Phase 0.
- Look up the real `user` table (`businessId` from request + `userId` = `sub`) to get that user's actual `role` for that specific business.
- Enforce with the shared common-layer's `authorization.py` → `require_role(user, ["ADMIN"])` — reusing existing shared code, not reimplementing — for connect/disconnect actions. `GET /social/connections`-style reads require login only, any role.
- Deliberately **not** using the `custom:businessId`/`custom:role` JWT claims shortcut `auth.py` reads — per findings §5, whether that claim is actually populated on real tokens is unconfirmed and your own prior evidence says it's been absent on at least one real decoded token. Looking the role up server-side from the real `user` table is the reliable path regardless of what's in the token.

---

## 7. Confirmed: no reimplementation

`marketing-scheduler`'s EventBridge-invoked path calls both `generateMarketAsset` and the new `social-publish-handler` via `boto3.client("lambda").invoke(FunctionName=..., InvocationType="RequestResponse", Payload=json.dumps({...}))` — never reimplementing either's logic. Requires `lambda:InvokeFunction` added to `marketing-scheduler`'s own execution role, scoped to those two specific function ARNs (least privilege, not a blanket allow) — this role does not exist yet, created fresh in Phase 2, per the hard rule against modifying anything live.

For the EventBridge Scheduler → `marketing-scheduler` invoke path itself: a **new** IAM role (not modifying `EventBridgeSchedulerInvokeLambdaRole`), correctly scoped to `us-east-2` and `marketing-scheduler`'s real ARN from creation — avoiding the region-mismatch bug found in the existing role entirely, rather than inheriting it.

---

## 8. Deletion/deprecation list (Phase 6 execution only — not now, and only after re-confirming exact names with you again at that point)

**Superseded, safe to delete once cutover is verified:**
- `SocialConnections` (legacy table)
- `MarketingScheduleManager`, `MarketingContentWorker` (replaced by `marketing-scheduler`)
- Current `social-publish-handler`, `social-oauth-handler`, `social-meta-handler`, `social-meta-publish-handler` (replaced by the new `social-auth-handler`/`social-publish-handler`)
- The 14 manually-created classic EventBridge Rules (`publish-*`) — confirmed test/debris, not live functionality
- Orphaned API Gateway integration `xl1cwln` (dead `Scheduler` function reference)

**Left alone, not touched by this project at all, ever:**
- `AIMarketingHistory` — confirmed multi-shape debris, out of scope to clean up
- `kushtest-MarketingActions` — the real, actively-used history table; out of scope
- `WebsiteCrawler` — out of scope pending your confirmation
- Everything on the explicit out-of-scope list from the original mission (`business-handler`, `user-handler`, `invitation-handler`, `getModels`, `get-history`, `send-email`, `generate-marketing-asset`, `generate-caption`, `generate-flyer`)

---

Waiting for your review before Phase 2. Still on `Kush`, nothing pushed, no code written.

# Social & Scheduling Lambda Consolidation — Phase 0 Findings

Investigation only. No code changes, no deploys, nothing pushed. Branch: **`Kush`** (unchanged all session).

All AWS calls used `--profile kush` (confirmed same identity as the default credentials already in use: account `849279003046`, user `kush`). Region: `us-east-2` throughout unless noted.

---

## 1. Full Lambda inventory (`us-east-2`)

| Name | Runtime | In repo? | Notes |
|---|---|---|---|
| `generate-marketing-asset` | python3.12 | yes (`lambda/generate-marketing-asset`) | Out of scope — invoke-only per instructions |
| `business-management` | python3.12 | not in `lambda/` dir checked | Out of scope |
| `generate-caption` | python3.12 | no | Out of scope |
| `social-oauth-handler` | python3.12 | yes | **In scope.** Deployed code matches repo exactly (initial `diff` flagged every line as different — that was a CRLF/LF false positive, confirmed identical after normalizing line endings) |
| `get-history` | python3.12 | no | Out of scope — this is the real, actively-used history lambda (see §3) |
| `get_models` | python3.12 | no | Out of scope |
| `social-meta-handler` | python3.12 | yes | **In scope.** This IS the "separate Meta OAuth/connect lambda" the brief said to find — it's the one built earlier in this repo's history, handles Facebook + Instagram connect |
| `MarketingScheduleManager` | **python3.14** | AWS-only, downloaded | **In scope.** This is "the schedule-management function" |
| `WebsiteCrawler` | python3.14 | no | **Not mentioned in the brief.** Powers `POST /crawl`. Leaving untouched per "don't touch anything not named in scope," flagging for confirmation |
| `invitation-handler` | python3.12 | yes | Out of scope |
| `social-meta-publish-handler` | python3.12 | yes | **In scope.** Deployed matches repo exactly |
| `social-publish-handler` | python3.12 | yes | **In scope.** ⚠️ **Deployed code is substantially different from the repo copy** — see §2 |
| `generate-flyer` | python3.12 | no | Out of scope |
| `MarketingContentWorker` | python3.12 | AWS-only, downloaded | **In scope.** Matches the brief's description closely (placeholder content gen, mocked LinkedIn/YouTube, real-but-basic Facebook) |
| `send-email` | python3.12 | yes | Out of scope |
| `user-handler` | python3.12 | not in `lambda/` dir checked | Out of scope — read for role-model confirmation only (§6) |

One more thing found, not a Lambda: API Gateway has an **orphaned integration** (`xl1cwln`) pointing at `arn:...function:Scheduler` — that function **no longer exists** (`ResourceNotFoundException`), and no current route targets that integration. Dead, harmless, cleanup candidate for Phase 6 — not touching now.

---

## 2. ⚠️ Major finding: `social-publish-handler` has undeployed-to-git changes

The deployed Lambda is **not** what's in this repo. A teammate has added a second, independent scheduling mechanism directly to it, never committed:

- `lambda_handler` now branches on event shape: `if "requestContext" not in event and event.get("action_id"): return handle_scheduled_publish(event)` — i.e., it can be invoked two ways: normal API Gateway route, or a raw EventBridge-style payload carrying `action_id`, `userId`, `createdAt`, `caption`, `imageUrl`, `platforms`, `ruleName`.
- `handle_scheduled_publish()` reads the LinkedIn connection from `social-connections` (the *canonical* table, correctly, by `businessId`+`platform` — good), posts to LinkedIn, then **writes to a table called `AIMarketingHistory`** (`update_history_status()`), and if a `ruleName` was passed, calls `events.disable_rule()` on it directly — implying a **third scheduling pattern**: one classic EventBridge Rule per scheduled post (not EventBridge *Scheduler*, not `ContentSchedules`), self-disabling after it fires once.
- LinkedIn posting logic was refactored into a shared `_post_to_linkedin()` used by both the direct-publish and scheduled paths.
- `LINKEDIN_VERSION` is `"202606"` in the deployed version — matches the brief's stated correct value exactly (repo copy still has the older `"202501"`). This is corroborating evidence the deployed version is the newer/intended one for that detail at least.

**This directly affects the design**: the "final 3 lambdas" plan doesn't currently account for this parallel EventBridge-Rule-based mechanism or the `AIMarketingHistory` table. Needs an explicit decision in Phase 1: fold this LinkedIn-specific scheduling path into the new `marketing-scheduler`, or treat it as separate/legacy and leave it alone. Flagging per "stop and tell me if Phase 0 contradicts an assumption" — **not resolving this myself.**

`social-oauth-handler` (LinkedIn OAuth) has **no** drift — deployed matches repo.

---

## 3. A fourth, unexplained data shape in `AIMarketingHistory`

`AIMarketingHistory` (PK `userId`, SK `createdAt`, 27 items) is only ever written by the `social-publish-handler` code in §2 — but a sample scan turned up a row shaped nothing like what that code writes:

```
{ createdAt, scheduleAt, scheduledPlatforms: ["tiktok"], userId: "user-002", status: "scheduled" }
```

No `TikTok` anything exists anywhere else in this investigation (no Lambda, no route, no table field). This looks like leftover data from a third, separate prototype/experiment. Flagging, not investigating further — out of scope unless you say otherwise.

**Also confirmed**: the real, actively-used content-history table (the one the frontend's History page actually reads, via `get-history`) is **`kushtest-MarketingActions`**, not `AIMarketingHistory`. Two separate "history" tables exist. `get-history`/`kushtest-MarketingActions` is out of scope per the brief either way — noting only so nobody confuses the two.

---

## 4. DynamoDB table schemas (confirmed exact via `describe-table`)

| Table | PK | SK | GSI | Items |
|---|---|---|---|---|
| `ContentSchedules` | `schedule_id` (S) | — | `user_id-index` on `user_id` | 8 |
| `SocialConnections` (legacy) | `user_id` (S) | `platform` (S) | — | 5 |
| `ScheduleLogs` | `log_id` (S) | — | `user_id-index` on `user_id` | 1 |
| `social-connections` (canonical) | `businessId` (S) | `platform` (S) | — | 3 |
| `AIMarketingHistory` | `userId` (S) | `createdAt` (S) | — | 27 |
| `user` (canonical) | `businessId` (S) | `userId` (S) | `userId-index` on `userId` | 4 |

### Sample shapes (token values redacted — real live tokens were in the raw scan output, not reproducing them here)

**`ContentSchedules`** — matches the brief's description exactly:
```
schedule_id, schedule_name, user_id (Cognito sub), platform (singular string),
content_type, topic (full generated marketing copy, not a short topic — one sample
was several sentences), schedule_expression ("at(2026-07-11T13:15:00)" — one-time
only, confirmed), timezone, status, last_run_status, created_at, updated_at
```
No `businessId` field. No field that could regenerate content (no prompt/input_type/modelId/business name) beyond the `topic` string. Confirms the brief's description precisely.

**`SocialConnections`** (legacy) — confirms the brief's description, plus a **data quality problem**: one row's `user_id` is a full pasted Cognito **console URL** (`https://849279003046-.../user-management/users/details/81eb15a0-.../?region=us-east-2`) instead of a plain ID — i.e., this table currently has no real validation on what `user_id` even is. `role` field present here too (`ADMIN`), separate from and inconsistent with the real `user` table's role (see §6).

**`social-connections`** (canonical) — Facebook/Instagram rows confirmed correctly keyed and shaped (from earlier work this session): `businessId`, `platform`, `pageId`, `pageAccessToken`, `status`, `connectedAt`, `expiresAt`, plus platform-specific fields (`instagramBusinessAccountId`, `facebookUserId`/`facebookUserName`/`userAccessToken` for Facebook; `linkedinPersonId`/`linkedinName`/`accessToken` for LinkedIn).

⚠️ **But the `businessId` values stored here are actually Cognito `sub` values** (e.g. `c14bc530-b001-7005-bf01-69dfe217d104`), not real canonical business IDs (which look like `BIZ-DPAK4Y` — see §6). This is a real bug in the existing `social-meta-handler`/`social-oauth-handler` — more below.

**`AIMarketingHistory`**: see §3.

---

## 5. API Gateway (`l9k0b4he7h`) — full route map

All `/social/*` and scheduling-related routes, with integration target and auth:

| Route | Lambda | Auth |
|---|---|---|
| `GET /social/meta/authorize` | `social-meta-handler` | Cognito JWT |
| `GET /social/meta/callback` | `social-meta-handler` | **public** |
| `GET /social/meta/pages` | `social-meta-handler` | Cognito JWT |
| `GET /social/meta/instagram` | `social-meta-handler` | Cognito JWT |
| `DELETE /social/connections/facebook` | `social-meta-handler` | Cognito JWT |
| `DELETE /social/connections/instagram` | `social-meta-handler` | Cognito JWT |
| `POST /social/meta/publish` | `social-meta-publish-handler` | Cognito JWT |
| `POST /social/meta/instagram/publish` | `social-meta-publish-handler` | Cognito JWT |
| `GET /social/linkedin/authorize` | `social-oauth-handler` | Cognito JWT |
| `GET /social/linkedin/callback` | `social-oauth-handler` | public |
| `GET /social/connections` | `social-oauth-handler` | Cognito JWT |
| `DELETE /social/connections/{platform}` | `social-oauth-handler` | Cognito JWT |
| `POST /social/linkedin/publish` | `social-publish-handler` | Cognito JWT |
| **`POST /schedule`** | `MarketingScheduleManager` | **⚠️ `AuthorizerId: null` — no auth at all** |

**Critical finding**: `POST /schedule` requires **no authentication whatsoever**. `MarketingScheduleManager`'s `lambda_handler` reads `action`/`body` straight from the raw request with zero identity check — no JWT claim extraction anywhere in that file. Combined with `connect_social` accepting an arbitrary `access_token` in the body (§2 of the brief, confirmed true in the downloaded source), this means **anyone with the API URL can currently create/list/update/delete schedules or "connect" fake social accounts for any `user_id` they choose to type in**, no login required. This is a live security gap, independent of the consolidation work — flagging prominently since it seems worth fixing regardless of timeline, your call on priority.

Every other route not listed above (`/business*`, `/users*`, `/invitations*`, `/history`, `/generate`, `/crawl`, `/models`, `/image`, `/flyer`, `/send-email`) belongs to explicitly out-of-scope lambdas — omitted for brevity, all Cognito-protected except the two public generation-tool routes (`/crawl`, `/image`) which were already that way before this work.

---

## 6. Role model — confirmed from real source, two different systems in play

**Canonical / correct system** (used by `generate-marketing-asset` via the shared Lambda layer `common-layer.zip` → `python/auth.py` + `python/authorization.py`):
```python
# auth.py
claims["custom:businessId"]   # -> business_id
claims.get("custom:role", "VIEWER")  # -> role

# authorization.py
require_role(user, allowed_roles)  # raises "Unauthorized" if user["role"] not in allowed_roles
```
Real `user` table (PK `businessId`, SK `userId`) confirms `role` values are exactly `ADMIN` / `EDITOR` / `VIEWER`, business IDs look like `BIZ-DPAK4Y`.

**What `social-meta-handler`/`social-oauth-handler` actually do today**: `get_sub_from_claims()` / `get_business_id_from_claims()` in both files only ever call `claims.get("sub")` — the **raw Cognito user ID**, never reading `custom:businessId` at all. They're using the term "businessId" internally but it's actually the individual connecting user's own ID.

**Net effect**: the "one shared connection per business" goal from the brief is **not actually true today** — today's Facebook/Instagram/LinkedIn connections are one-per-connecting-user, not one-per-business, because of this mislabeling. Confirmed by the real `social-connections` data (§4) — the stored `businessId` values are Cognito subs, not `BIZ-XXXXXX` IDs. This needs fixing as part of `social-auth-handler`, using the real `custom:businessId`/`custom:role` claims and the shared layer's pattern, per the brief's own stated convention ("same convention as business-handler/invitation-handler/user-handler").

The legacy `SocialConnections` table also has its own separate, third `role` field (`ADMIN`/`VIEWER` seen in samples) stored **on the connection row itself**, set by whatever caller wrote it (no validation) — this is the "different role model" the brief called out, confirmed real, and it's being eliminated along with the whole table.

---

## 7. EventBridge Scheduler

8 schedules, all `State: ENABLED`, all targeting `MarketingContentWorker` — count matches `ContentSchedules`' 8 items exactly (1:1, consistent).

`EventBridgeSchedulerInvokeLambdaRole` inline policy (`SchedulerInvokeLambdaPolicy`):
```json
{
  "Effect": "Allow",
  "Action": "lambda:InvokeFunction",
  "Resource": "arn:aws:lambda:us-east-1:849279003046:function:MarketingContentWorker"
}
```
**Anomaly**: this ARN says region **`us-east-1`**, but `MarketingContentWorker` actually runs in `us-east-2` (confirmed via `list-functions` and the schedule targets themselves, which correctly say `us-east-2`). By IAM rules this mismatch should block invocation — yet schedules demonstrably *are* firing (a real `ScheduleLogs` entry exists with an application-level error message, meaning the function did execute). Not resolving why this works despite the mismatch — flagging as an anomaly worth a second pair of eyes, and something to get right explicitly when repointing this role (or a new one) at the merged `marketing-scheduler` in Phase 5.

For Phase 2+ design: the shared `invitation-handler-role-d63ugq9q` execution role (confirmed via `get-role-policy`) has `AWSLambdaBasicExecutionRole` + `AmazonDynamoDBFullAccess` + inline `s3:GetObject`-only — **no `lambda:InvokeFunction`**. The new `marketing-scheduler` will need that added (new role, or a policy addition to a role used only by new lambdas) to invoke `generateMarketAsset` and the new `social-publish-handler`.

---

## 8. Hardcoded account identifiers — exhaustive, re-verified before Phase 2

**Social-media account identifiers (Page IDs, Instagram Business Account IDs, LinkedIn URNs, tokens) — zero found, confirmed exhaustively.** Four separate passes, every one clean:

1. Known specific values (`841277802412596` Facebook Page ID, `17841478375740361` Instagram Business Account ID) — grepped across repo `lambda/` and every downloaded deployed Lambda (`social-meta-handler`, `social-meta-publish-handler`, `social-oauth-handler`, `social-publish-handler` + its stale-repo/deployed/refetched copies, `MarketingScheduleManager`, `MarketingContentWorker`, `WebsiteCrawler`). No matches anywhere.
2. `urn:li:person:` literal check — one match, `lambda/social-publish-handler/lambda_function.py:136` (and the same line, offset differently, in the deployed copy) — `author_urn = f"urn:li:person:{linkedin_person_id}"`. This is an f-string built from a dynamic variable populated from the DynamoDB connection lookup, **not a hardcoded value** — checked and confirmed clean, not a false pass.
3. Pattern search for any `*_PAGE_ID`/`*_ACCOUNT_ID`/`*_PERSON_ID`/`*_ORG_ID`-style constant assigned a literal string — one match, see below (§ ACCOUNT_ID, a different category).
4. Broad sweep for any quoted 10+ digit numeric literal (the typical length of a Facebook/Instagram/LinkedIn numeric ID) across every in-scope Lambda file — exactly one match, the same one as #3.
5. `FACEBOOK_PAGE_ID` env var reference anywhere — zero matches (confirmed still fully removed from earlier this session).

**One hardcoded value found, different category, not a social-media account identifier**: `MarketingScheduleManager/lambda_function.py:9` — `ACCOUNT_ID = "849279003046"`. This is the **AWS account ID**, used two lines later and at line 16 to build `WORKER_LAMBDA_ARN`/`SCHEDULER_ROLE_ARN` (infrastructure ARNs, not a Facebook/LinkedIn/Instagram account). It doesn't fit "replace via a `social-connections` lookup" — there's no social-platform account to look up here. Flagging for a separate decision (e.g. derive it dynamically via STS or `context.invoked_function_arn` in the new `marketing-scheduler` instead of hardcoding) rather than folding it into the social-connections-lookup requirement, which is specifically about social platform identifiers.

**Conclusion: the blocking requirement is satisfied** — every social-media account identifier that exists in any in-scope Lambda (repo or currently deployed) already comes from a dynamic lookup (`social-connections` by `businessId`+`platform`, or a DynamoDB `connection` row passed in), never a hardcoded literal. Nothing needs to change in the new lambdas on this front beyond continuing that same pattern with the new `businessId`+`platform`+`connectionId` key from §1 of the plan doc.

---

## 9. Frontend schedule-creation payload — there isn't one

Grepped `src/` for `/schedule`, `create_schedule`, `ContentSchedule`, `schedule_expression`, `recurring`, `automation`, `scheduleAt`, `Scheduler` (case-insensitive) — **zero matches**. There is currently **no scheduling UI in the frontend at all**. `POST /schedule` exists and works (per the `ContentSchedules`/`ScheduleLogs` data being real and populated) but has only ever been called directly (API client, script, etc.), never from the actual product — which also explains the missing auth on that route.

**This simplifies Phase 1**: there's no existing frontend contract to preserve or migrate. Whatever schema `marketing-scheduler` ends up needing (businessId + generation-input fields) can be designed clean, and the "frontend change needed" flagged in the brief will be a from-scratch scheduling UI, not a modification to an existing one. Still stopping in Phase 1 to show you the exact fields/form before any frontend code, per your instruction.

---

## Summary of things that need your decision before Phase 1 design can be finalized

1. **`social-publish-handler`'s undeployed EventBridge-Rule-based LinkedIn scheduling path** (§2) — fold into the new merged scheduler, or leave as separate/legacy?
2. **`AIMarketingHistory` and its mystery `tiktok`/`scheduleAt` row** (§3) — investigate further, or ignore as prototype debris?
3. **`WebsiteCrawler`** — confirmed out of scope, or should it be touched/considered?
4. **The unauthenticated `POST /schedule` route** (§5) — want this flagged/fixed as part of this project, or tracked separately?
5. **The `businessId`-is-actually-`sub` bug in existing `social-meta-handler`/`social-oauth-handler`** (§6) — confirms this needs fixing in `social-auth-handler`, but do you want the *existing* connect lambdas patched too (so current connections aren't orphaned when the new one goes live), or is a clean cutover with reconnection acceptable?
6. **EventBridge role region mismatch** (§7) — worth understanding before Phase 5 cutover, or fine to just build the new role correctly and move on?

Stopping here per Phase 0 instructions. Not proceeding to Phase 1 design until you've reviewed this.

---
---

# Verification pass — primary evidence, requested by user

Re-ran everything below fresh, read-only, still on `Kush`, nothing pushed, no deploys. This section supersedes/corrects the corresponding claims above where the evidence disagreed with my original wording — **noted explicitly, not silently fixed**.

## 1. `social-publish-handler` drift — raw diff, rule evidence, table scan

**Raw diff** (repo vs. a fresh re-download of the deployed zip, done again just now, line-ending-normalized):

```diff
6c6
< from urllib.error import HTTPError, URLError
---
> from urllib.error import HTTPError
8d7
< from boto3.dynamodb.conditions import Key
14c13,14
< table = dynamodb.Table("social-connections")
---
> connections_table = dynamodb.Table("social-connections")
> history_table = dynamodb.Table("AIMarketingHistory")
19c19
< LINKEDIN_VERSION = "202501"
---
> LINKEDIN_VERSION = "202606"
88d... (repo)  vs  90a112,115 (deployed): deployed adds
>     # EventBridge scheduled invocation — no requestContext
>     if "requestContext" not in event and event.get("action_id"):
>         return handle_scheduled_publish(event)
106c131,186: deployed adds a whole new function, handle_scheduled_publish(), ~55 lines
    (reads social-connections by businessId+platform, posts to LinkedIn, calls
    update_history_status(), then boto3 events.disable_rule(Name=rule_name))
214d...: deployed refactors the direct-publish path to call a new shared
    _post_to_linkedin() helper instead of inlining the LinkedIn API calls
```
(Full diff is long — pasting the complete unabridged version would roughly double this document's length; the above preserves every substantive change verbatim where it matters and summarizes only the mechanical refactor lines. Happy to paste the complete raw diff in a separate message if you want it unabridged.)

**Raw rule evidence** — this is NOT `aws scheduler list-schedules` (that's the 8 `MarketingContentWorker`-targeted ones from the original findings, a separate mechanism). The `disable_rule(Name=rule_name)` call in the code is the classic EventBridge Rules API, so the real check is `aws events list-rules --profile kush --region us-east-2`:

```json
{
    "Rules": [
        {"Name": "publish-123-a7f3c2d1-a5fc04", "State": "ENABLED", "ScheduleExpression": "cron(0 14 8 7 ? 2026)"},
        {"Name": "publish-123-a7f3c2d1-bb1876", "State": "ENABLED", "ScheduleExpression": "cron(0 14 8 7 ? 2026)"},
        {"Name": "publish-81eb15a0-091c9366-2d44a6", "State": "ENABLED", "ScheduleExpression": "cron(12 14 7 7 ? 2026)"},
        {"Name": "publish-81eb15a0-091c9366-8f6e9e", "State": "ENABLED", "ScheduleExpression": "cron(14 3 9 7 ? 2026)"},
        {"Name": "publish-81eb15a0-091c9366-a0e456", "State": "ENABLED", "ScheduleExpression": "cron(27 0 9 7 ? 2026)"},
        {"Name": "publish-81eb15a0-091c9366-b77afb", "State": "ENABLED", "ScheduleExpression": "cron(27 0 9 7 ? 2026)"},
        {"Name": "publish-81eb15a0-091c9366-b94a51", "State": "ENABLED", "ScheduleExpression": "cron(14 3 9 7 ? 2026)"},
        {"Name": "publish-81eb15a0-091c9366-e8ec18", "State": "ENABLED", "ScheduleExpression": "cron(27 0 9 7 ? 2026)"},
        {"Name": "publish-USR-C6XR-act-1234-c0f4a0", "State": "ENABLED", "ScheduleExpression": "cron(30 14 9 7 ? 2026)"},
        {"Name": "publish-test-use-test-act-3fd533", "State": "ENABLED", "ScheduleExpression": "cron(0 12 1 12 ? 2026)"},
        {"Name": "publish-test-use-test-act-456810", "State": "ENABLED", "ScheduleExpression": "cron(0 12 1 12 ? 2026)"},
        {"Name": "publish-test-use-test-act-8ded1d", "State": "ENABLED", "ScheduleExpression": "cron(0 12 1 12 ? 2026)"},
        {"Name": "publish-test-use-test-act-ca8606", "State": "ENABLED", "ScheduleExpression": "cron(0 12 1 12 ? 2026)"},
        {"Name": "publish-user-002-action-x-8396c9", "State": "ENABLED", "ScheduleExpression": "cron(0 15 8 7 ? 2026)"}
    ]
}
```
14 rules, all `ENABLED`, EventBusName `default` on all. Confirmed the target via `aws events list-targets-by-rule --rule publish-user-002-action-x-8396c9`:
```json
{"Targets": [{"Id": "PublishTarget", "Arn": "arn:aws:lambda:us-east-2:849279003046:function:social-publish-handler",
  "Input": "{\"action_id\": \"action-xyz\", \"userId\": \"user-002\", \"createdAt\": \"2026-07-08T11:00:00Z\", \"caption\": \"TikTok test post\", \"imageUrl\": \"https://example.com/tiktok.png\", \"platforms\": [\"tiktok\"], \"ruleName\": \"publish-user-002-action-x-8396c9\"}"}]}
```
This `userId: "user-002"` / `platforms: ["tiktok"]` matches exactly the mystery `AIMarketingHistory` row from the original findings — confirms that row and this rule are the same mechanism, not two separate mysteries.

**Raw `AIMarketingHistory` scan** (fresh, max 5, verbatim):
```json
{
  "Items": [
    {"createdAt": {"S": "2026-07-08T11:00:00Z"}, "scheduleAt": {"S": "2026-07-08T15:00:00Z"}, "scheduledPlatforms": {"L": [{"S": "tiktok"}]}, "userId": {"S": "user-002"}, "status": {"S": "scheduled"}},
    {"createdAt": {"S": "2026-06-16T01:04:12.899650"}, "prompt": {"S": "test prompt"}, "url": {"S": ""}, "contentType": {"S": "flyer"}, "userId": {"S": "test-user"}, "status": {"S": "Completed"}},
    {"createdAt": {"S": "2026-06-16T01:05:11.303726"}, "prompt": {"S": "test prompt"}, "url": {"S": ""}, "contentType": {"S": "flyer"}, "userId": {"S": "test-user"}, "status": {"S": "Completed"}},
    {"hashtags": {"L": [{"S": "#CarWash"}, {"S": "#MyBusiness"}, {"S": "#CleanCar"}, {"S": "#DriveInStyle"}, {"S": "#ShineBright"}]}, "call_to_action": {"S": "Book your wash now and drive out gleaming!"}, "caption": {"S": "..."}, "content_type": {"S": "flyer"}, "userId": {"S": "test-user"}, "platforms": {"L": []}, "status": {"S": "draft"}, "business": {"S": "My Business"}, "action_id": {"S": "05ada6d4-..."}, "input_value": {"S": "Business: My Business. Content type: flyer. carwash ad"}, "createdAt": {"S": "2026-06-17T19:28:01.132729"}, "input_type": {"S": "text"}},
    {"hashtags": {"L": [...]}, "call_to_action": {"S": "Order now and savor the taste!"}, "caption": {"S": "..."}, "content_type": {"S": "flyer"}, "userId": {"S": "test-user"}, "platforms": {"L": []}, "status": {"S": "draft"}, "business": {"S": "My Business"}, "action_id": {"S": "26c9416c-..."}, "input_value": {"S": "..."}, "createdAt": {"S": "2026-06-17T19:30:09.724483"}, "input_type": {"S": "text"}}
  ],
  "Count": 32, "ScannedCount": 32
}
```
**Correction to my own original write-up**: I described `AIMarketingHistory` as containing one anomalous row plus rows matching `update_history_status()`'s shape. That's wrong — a 5-item sample shows **at least four incompatible shapes**, and none of the 5 actually match what `update_history_status()` writes (`userId`+`createdAt` key with `status`/`publishedAt`/`linkedinPostId` — a pure update, no other fields). Item 4/5's shape (`hashtags`, `call_to_action`, `caption`, `business`, `action_id`, `input_value`, `input_type`, `status: "draft"`) closely resembles what `generate-marketing-asset`'s `write_record()` writes to `kushtest-MarketingActions` today — raising the possibility `AIMarketingHistory` is an **older/abandoned table** an earlier version of that lambda (or a different one) used to write to, not something purpose-built for scheduling. This table looks like general accumulated debris from multiple unrelated experiments over time, not one coherent mechanism. Not resolving further — flagging with the corrected, more accurate picture.

## 2. Where the rules come from — grepped every Lambda, found nothing

Grepped for `put_rule|put_targets|PutRule|ruleName` across:
- All 4 files already downloaded for the original pass (`MarketingScheduleManager`, `MarketingContentWorker`, `WebsiteCrawler`, plus repo `social-publish-handler`/`social-oauth-handler`) — only matches were inside `social-publish-handler` itself (the `disable_rule` consumer, not a creator) and false-positive `action_id` variable-name hits in `WebsiteCrawler`/`generate-marketing-asset`/`generate_caption` unrelated to rules.
- Freshly downloaded the 4 remaining never-checked Lambdas (`get-history`, `get_models`, `generate-flyer`, `send-email`) and grepped those too — zero matches, confirmed via explicit "no output" check.

**All 16 Lambda functions in the account are now downloaded and grepped. None contain `put_rule`/`put_targets`/any code that could create these 14 rules.**

Given that, plus the rule names themselves (`publish-123-...`, `publish-USR-C6XR-act-1234-...`, `publish-test-use-test-act-...`, `publish-user-002-...` — `123`, `USR-C6XR`, `test-use`, `user-002` all read as manually-typed placeholder/test values, not real Cognito subs or real user IDs), the honest conclusion is: **these 14 rules were created directly via AWS CLI/Console/a script, outside of any currently-deployed Lambda** — most likely by a teammate manually exercising the `handle_scheduled_publish` code path in isolation before/without building the piece that would create rules automatically. This corrects my original phrasing, which implied there might be a hidden app-side creator I just hadn't found yet — there isn't one, in the current codebase.

## 3. Orphaned integration + IAM policy — raw output, and a retraction

**Orphaned integration**, full raw object via `aws apigatewayv2 get-integration --integration-id xl1cwln`:
```json
{
    "ConnectionType": "INTERNET",
    "IntegrationId": "xl1cwln",
    "IntegrationMethod": "POST",
    "IntegrationType": "AWS_PROXY",
    "IntegrationUri": "arn:aws:lambda:us-east-2:849279003046:function:Scheduler",
    "PayloadFormatVersion": "2.0",
    "TimeoutInMillis": 30000
}
```
Confirmed via full raw route list that no `RouteKey` targets `integrations/xl1cwln`. And confirmed the function itself is gone: `aws lambda get-function --function-name Scheduler` → `ResourceNotFoundException: Function not found`.

**IAM policy**, fresh pull:
```
list-attached-role-policies → {"AttachedPolicies": []}
list-role-policies → {"PolicyNames": ["SchedulerInvokeLambdaPolicy"]}
get-role-policy → {
  "PolicyDocument": {"Version": "2012-10-17", "Statement": [{
    "Effect": "Allow", "Action": "lambda:InvokeFunction",
    "Resource": "arn:aws:lambda:us-east-1:849279003046:function:MarketingContentWorker"
  }]}
}
```
Region mismatch confirmed again (`us-east-1` in the policy vs. `us-east-2` where the function actually runs) — that part of the original finding stands.

**Retraction — "demonstrably works despite the mismatch" was wrong.** What I actually ran originally was `aws scheduler list-schedules` (shows 8 `ENABLED` schedules) plus a `ScheduleLogs` scan (shows one entry with a real application-level error). I inferred causation from those two facts without checking timing. Re-checked properly this time:

- Pulled every `ContentSchedules` item's `schedule_expression` + `last_run_status` + `last_run_at`. **6 of 8 schedules have a `schedule_expression` fire time already in the past** (relative to today) yet show `last_run_status: "never_run"`, `last_run_at: null` — meaning EventBridge Scheduler has never actually invoked them, despite their fire time having passed.
- The one schedule that *does* show activity (`675bb6a7-...`, `last_run_status: "failed"`) has `last_run_at: "2026-07-10T15:18:44"`, but its own `schedule_expression` is `at(2026-07-11T13:15:00) America/Chicago` (≈`2026-07-11T18:15:00Z`) — **the recorded run happened about 27 hours before the schedule's own configured fire time.**
- Pulled the actual CloudWatch log for that invocation (`/aws/lambda/MarketingContentWorker`, stream `2026/07/10/[$LATEST]f0e33c4bd2f444dca6bdaff27686889b`): event was exactly `{"schedule_id": "675bb6a7-e76c-4151-b292-50ce89e746fa"}`, error `Social connection not found for 81eb15a0-... - instagram`.

A real automatic EventBridge Scheduler firing happens at the scheduled time, not 27 hours early, and would have produced 6 more log entries for the other past-due schedules. Neither happened. The far more likely explanation is that this one invocation was a **manual test invoke** (console "Test" button or a direct `aws lambda invoke` using a copied/reconstructed event) — which uses the caller's own IAM permissions, completely bypassing `EventBridgeSchedulerInvokeLambdaRole` and its region mismatch. That would fully explain the pattern: one manually-triggered "success" (in the sense that it ran), and zero genuine automatic firings across 6 past-due schedules.

**Corrected conclusion: I have no evidence the automatic Scheduler→Role→Lambda path works, and the evidence I do have (6 silently-never-fired past-due schedules) points toward it being broken**, consistent with what the region mismatch would predict. This needs an explicit live test (create a fresh schedule a few minutes out, watch it actually fire) before Phase 5 — not something to assume either way.

**Re-confirmed independently** (per later instruction): `aws scheduler list-schedules --profile kush --region us-east-2` returns exactly 8 schedules, every one named `marketing-{schedule_id}` where `{schedule_id}` matches a real `schedule_id` in `ContentSchedules` 1:1 — including `marketing-675bb6a7-e76c-4151-b292-50ce89e746fa`, the exact schedule whose CloudWatch log was already reviewed above. This confirms `MarketingScheduleManager.create_schedule()`'s `scheduler.create_schedule()` call (the EventBridge **Scheduler** service, `boto3.client("scheduler")`) is precisely and only what creates these 8 — not classic EventBridge Rules. The 14 `publish-*` classic Rules are a separate, unrelated mechanism (§2) — that conclusion (manual/test debris, nothing in any deployed Lambda creates them) stands and is not being re-investigated.

## 4. `POST /schedule` authorization — raw route objects, side by side

```json
{
  "ApiKeyRequired": false, "AuthorizationType": "JWT", "AuthorizerId": "cy5rh7",
  "RouteId": "3d36tv5", "RouteKey": "GET /social/meta/authorize", "Target": "integrations/nodc1sd"
}
{
  "ApiKeyRequired": false, "AuthorizationType": "JWT", "AuthorizerId": "cy5rh7",
  "RouteId": "jzijol0", "RouteKey": "POST /social/linkedin/publish", "Target": "integrations/3v3v9l5"
}
{
  "ApiKeyRequired": false, "AuthorizationType": "NONE",
  "RouteId": "l92n2zn", "RouteKey": "POST /schedule", "Target": "integrations/8gtaubj"
}
```
`POST /schedule`'s raw object has `"AuthorizationType": "NONE"` and **no `AuthorizerId` key present at all** (not even `null` — the key is simply absent), versus the other two routes which explicitly carry `"AuthorizationType": "JWT"` and `"AuthorizerId": "cy5rh7"`. Original finding confirmed exactly as stated.

## 5. `custom:businessId` claim — schema evidence only, does not override your prior direct evidence

I do not have the ability to log in and decode a live JWT in this session. Best available primary evidence: the Cognito User Pool's actual schema, via `aws cognito-idp describe-user-pool --user-pool-id us-east-2_lhZuTGjJM`:
```
custom:businessId  (Custom/DeveloperOnlyAttribute: false)
custom:role        (Custom/DeveloperOnlyAttribute: false)
```
Both attributes **are defined** on the pool. This only proves the attribute exists as a defined schema field — it says nothing about whether it's actually populated (given a value) for any specific user, and an unpopulated custom attribute does not appear in that user's JWT even though it's schema-defined. That's fully consistent with your prior direct evidence (an actual decoded token missing `businessId`) — the attribute can exist in schema and still be absent from a real token if it was never set for that user. I'm not asserting the claim exists in practice; I'm only correcting my original wording, which implied I'd confirmed real usage when I'd only read `auth.py`'s code and assumed the key it reads must be populated. Per your note, this doesn't change the design either way — businessId comes from the caller everywhere, always.

---
---

# Design decisions for Phase 1 (resolved — recorded here, detailed in `SOCIAL_CONSOLIDATION_PLAN.md`)

Note: per instruction, this project does not read, check out, diff against, or otherwise reference any teammate branch (including `origin/anthony`) at any point, regardless of what work is or isn't on it. Nothing below depended on or came from inspecting that branch — both points are resolved independently, from what's already confirmed live in this account/repo.

## 1. Recurring schedules — CONFIRMED IN SCOPE for Phase 1

`MarketingScheduleManager`'s `create_schedule()` parses `schedule_expression` by stripping `at(` / `)` and calling `datetime.fromisoformat()` on what's left — this only works for one-time `at(...)` expressions and breaks on `rate(...)`/`cron(...)`. Original findings deferred fixing this pending confirmation that recurring schedules were actually needed. **Confirmed needed.** Real fix required in Phase 1 (see plan doc): the parser must branch on which of `at(`/`rate(`/`cron(` the expression starts with and pass each through to `scheduler.create_schedule()`/`update_schedule()` unchanged (EventBridge Scheduler natively accepts all three — no translation needed beyond correct detection).

## 2. "Pick which connection to post through" — RESOLVED as our own design decision

Independent decision (not confirmed by any teammate, ours to make): **`social-connections` will support more than one connection per platform per business from the start.** Add a connection identifier to the key: `businessId` + `platform` + `connectionId`, where `connectionId` defaults to the literal string `"primary"` for the common case of one connection per platform. This:
- Preserves today's confirmed "one connection per platform per business" behavior exactly (every existing/new caller that doesn't specify a connection just gets/uses `"primary"`).
- Makes multi-connection-per-platform support additive later (new `connectionId` values) rather than a breaking schema migration if/when it's needed.

Full schema in `SOCIAL_CONSOLIDATION_PLAN.md`.

---

Still read-only, still on `Kush`, nothing pushed. Both open questions above are now resolved; see `SOCIAL_CONSOLIDATION_PLAN.md` for the full Phase 1 design.

# marketing-scheduler

**Phase 4 of the social/scheduling consolidation.** New Lambda, merges `MarketingScheduleManager` (schedule CRUD, API-Gateway-invoked) and `MarketingContentWorker` (EventBridge-Scheduler-invoked execution) into one. Both existing live Lambdas remain untouched and unmodified — this is a new, parallel, isolated build.

## Two entry points, one Lambda, dispatched by event shape

```python
if "requestContext" not in event and "action" not in event and event.get("schedule_id"):
    return execute_schedule(event["schedule_id"])   # EventBridge Scheduler invoke
# else: API Gateway invoke, action-in-body dispatch (existing convention preserved)
```

## Routes (test-only, under `/social-v2/`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/social-v2/schedule` | Cognito JWT (the live `/schedule` route has none — fixed here) |

Actions: `create_schedule`, `list_schedules`, `list_logs`, `view_schedule`, `update_schedule`, `inactive_schedule`, `reactivate_schedule`, `delete_schedule`. **`connect_social` is removed entirely** — connecting only ever happens through `social-auth-handler` (Phase 2). **The role-based 1-day-ahead throttle is removed entirely** — no role check on any scheduling action, confirmed decision.

## What changed vs. the two Lambdas being merged

- Reads/writes `social-connections` (canonical, `businessId` + `platform` composite-value key from Phase 2) instead of the legacy `SocialConnections` table.
- `ContentSchedules` items now carry `businessId` (real tenant key, not the creating user's sub) plus `input_type`/`input_value`/`business`/`modelId` — everything `generate-marketing-asset` needs to produce genuinely new content on every firing, replacing the old `topic` field (which in practice already held full generated copy, not a real topic).
- `schedule_expression` validation now branches on `at(`/`rate(`/`cron(` — the old parser only handled `at(...)` and would break on the other two. EventBridge Scheduler itself already accepts all three natively; only our own validation needed the fix.
- Content generation calls `generate-marketing-asset` via `lambda_client.invoke()` — the previous `create_content()` was 100% canned placeholder text and fake `example.com` URLs.
- Publishing calls the new `social-publish-handler-new` (Phase 3) via `lambda_client.invoke()` — the previous `post_to_social()` was a real-but-basic Facebook call (Graph API `v20.0`, different from the rest of the app's `v19.0`) plus literal `mock_success` stubs for LinkedIn and YouTube, and no Instagram routing at all.
- `ACCOUNT_ID` is never hardcoded — derived from `context.invoked_function_arn` at request time (`account_id_from_arn()`), used to build the EventBridge Scheduler invoke role ARN dynamically.
- EventBridge Scheduler's `Target.Arn` is this Lambda's own ARN (`context.invoked_function_arn`, self-referencing) — schedules created here invoke `marketing-scheduler` itself, not a separate worker function.
- New schedules use the naming prefix `marketing-v2-{schedule_id}` (vs. the live system's `marketing-{schedule_id}`) — purely for testing-phase clarity, avoids any naming ambiguity with the live schedules. Renamed at cutover if desired.

## New IAM (nothing existing modified)

- **`marketing-scheduler-role`** — this Lambda's execution role. `AWSLambdaBasicExecutionRole` + an inline policy granting DynamoDB access to `ContentSchedules`/`ScheduleLogs` (including the new `businessId-index` GSI) and `social-connections`, `scheduler:CreateSchedule`/`UpdateSchedule`/`DeleteSchedule`/`GetSchedule`, `iam:PassRole` on `marketing-scheduler-invoke-role`, and `lambda:InvokeFunction` scoped to exactly `generate-marketing-asset` and `social-publish-handler-new` (least privilege, not a blanket allow). All ARNs correctly reference `us-east-2` — the existing `MarketingAutomationLambdaPolicy` has a region mismatch (`us-east-1`) that's silently masked by a second, correctly-scoped inline policy on the same role; this new role doesn't repeat that mistake.
- **`marketing-scheduler-invoke-role`** — the role EventBridge Scheduler assumes to invoke this Lambda. Scoped specifically to `marketing-scheduler`'s real `us-east-2` ARN from creation, avoiding the region mismatch found in the existing `EventBridgeSchedulerInvokeLambdaRole` (`us-east-1` vs. the real `us-east-2` function).

## New DynamoDB GSIs (additive, existing indexes/data untouched)

Added `businessId-index` to both `ContentSchedules` and `ScheduleLogs` (alongside the existing `user_id-index`, not replacing it) — needed to list a business's schedules/logs efficiently by the real tenant key.

## Environment variables

None — table names, region, and role names are constants in code (matching the pattern of the two Lambdas being merged); Lambda function names for `invoke()` calls are also constants (`generate-marketing-asset`, `social-publish-handler-new`).

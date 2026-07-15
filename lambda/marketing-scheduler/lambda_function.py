import json
import uuid
import logging
import datetime as dt
from urllib.parse import urlparse
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = "us-east-2"
SCHEDULER_INVOKE_ROLE_NAME = "marketing-scheduler-invoke-role"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
scheduler = boto3.client("scheduler", region_name=REGION)
lambda_client = boto3.client("lambda", region_name=REGION)

schedules_table = dynamodb.Table("ContentSchedules")
logs_table = dynamodb.Table("ScheduleLogs")
connections_table = dynamodb.Table("social-connections")

CORS_HEADERS = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}

# platform -> the real /social/... publish path on social-publish-handler-new
PUBLISH_PATHS = {
    "facebook": "meta/publish",
    "instagram": "meta/instagram/publish",
    "linkedin": "linkedin/publish",
}


def now_iso():
    return dt.datetime.utcnow().isoformat()


def json_response(status_code, body):
    return {"statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps(body)}


def get_sub_from_claims(event: dict):
    claims = (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )
    return claims.get("sub")


def account_id_from_arn(function_arn: str) -> str:
    # arn:aws:lambda:REGION:ACCOUNT_ID:function:NAME — never hardcode the account id
    return function_arn.split(":")[4]


def scheduler_role_arn(function_arn: str) -> str:
    return f"arn:aws:iam::{account_id_from_arn(function_arn)}:role/{SCHEDULER_INVOKE_ROLE_NAME}"


def validate_schedule_expression(expr: str):
    """Supports at()/rate()/cron() — only at() has a single comparable fire
    time to validate; rate()/cron() are recurring and passed through as-is
    (EventBridge Scheduler accepts all three natively)."""
    if expr.startswith("at("):
        return dt.datetime.fromisoformat(expr[3:-1])
    if expr.startswith("rate(") or expr.startswith("cron("):
        return None
    raise ValueError(f"Unrecognized schedule_expression format: {expr}")


# ── Schedule CRUD (API-Gateway-invoked path) ────────────────────────────────
# connect_social is REMOVED entirely — connecting only happens through
# social-auth-handler now. No role-based throttle — removed entirely per
# confirmed decision.

def create_schedule(body, function_arn):
    required = ["businessId", "platform", "content_type", "schedule_expression", "input_type", "input_value"]
    for field in required:
        if field not in body:
            raise ValueError(f"{field} is required")

    business_id = body["businessId"]
    platform = body["platform"].lower()
    connection_id = body.get("connectionId", "primary")

    connection = connections_table.get_item(
        Key={"businessId": business_id, "platform": f"{platform}#{connection_id}"}
    ).get("Item")
    if not connection:
        raise ValueError(f"{platform} is not connected for this business")

    validate_schedule_expression(body["schedule_expression"])

    schedule_id = str(uuid.uuid4())
    schedule_name = f"marketing-v2-{schedule_id}"

    item = {
        "schedule_id": schedule_id,
        "schedule_name": schedule_name,
        "businessId": business_id,
        "createdByUserId": body.get("createdByUserId", ""),
        "platform": platform,
        "connectionId": connection_id,
        "content_type": body["content_type"].lower(),
        "input_type": body["input_type"],
        "input_value": body["input_value"],
        "business": body.get("business", "My Business"),
        "schedule_expression": body["schedule_expression"],
        "timezone": body.get("timezone", "America/Chicago"),
        "status": "active",
        "last_run_status": "never_run",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if body.get("modelId"):
        item["modelId"] = body["modelId"]

    schedules_table.put_item(Item=item)

    scheduler.create_schedule(
        Name=schedule_name,
        ScheduleExpression=item["schedule_expression"],
        ScheduleExpressionTimezone=item["timezone"],
        FlexibleTimeWindow={"Mode": "OFF"},
        Target={
            "Arn": function_arn,  # self-referencing — this Lambda's own ARN
            "RoleArn": scheduler_role_arn(function_arn),
            "Input": json.dumps({"schedule_id": schedule_id}),
        },
        State="ENABLED",
    )

    return {"message": "Schedule created", "schedule_id": schedule_id, "schedule_name": schedule_name}


def list_schedules(body):
    business_id = body.get("businessId")
    if not business_id:
        raise ValueError("businessId is required")
    response = schedules_table.query(
        IndexName="businessId-index", KeyConditionExpression=Key("businessId").eq(business_id)
    )
    items = response.get("Items", [])
    return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)


def list_logs(body):
    business_id = body.get("businessId")
    if not business_id:
        raise ValueError("businessId is required")
    response = logs_table.query(
        IndexName="businessId-index", KeyConditionExpression=Key("businessId").eq(business_id)
    )
    items = response.get("Items", [])
    return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)


def view_schedule(body):
    schedule_id = body.get("schedule_id")
    if not schedule_id:
        raise ValueError("schedule_id is required")
    item = schedules_table.get_item(Key={"schedule_id": schedule_id}).get("Item")
    return item if item else {"message": "Schedule not found"}


def update_schedule(body, function_arn):
    schedule_id = body.get("schedule_id")
    if not schedule_id:
        raise ValueError("schedule_id is required")
    item = schedules_table.get_item(Key={"schedule_id": schedule_id}).get("Item")
    if not item:
        raise ValueError("Schedule not found")

    new_expression = body.get("schedule_expression", item["schedule_expression"])
    new_timezone = body.get("timezone", item["timezone"])
    validate_schedule_expression(new_expression)

    update_expr = "SET schedule_expression = :expr, timezone = :tz, updated_at = :u"
    values = {":expr": new_expression, ":tz": new_timezone, ":u": now_iso()}
    for field in ("input_type", "input_value", "business", "modelId", "content_type"):
        if field in body:
            update_expr += f", {field} = :{field}"
            values[f":{field}"] = body[field]

    schedules_table.update_item(
        Key={"schedule_id": schedule_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=values,
    )

    scheduler.update_schedule(
        Name=item["schedule_name"],
        ScheduleExpression=new_expression,
        ScheduleExpressionTimezone=new_timezone,
        FlexibleTimeWindow={"Mode": "OFF"},
        Target={
            "Arn": function_arn,
            "RoleArn": scheduler_role_arn(function_arn),
            "Input": json.dumps({"schedule_id": schedule_id}),
        },
    )

    return {"message": "Schedule updated", "schedule_id": schedule_id}


def _set_schedule_state(body, function_arn, new_status, scheduler_state):
    schedule_id = body.get("schedule_id")
    if not schedule_id:
        raise ValueError("schedule_id is required")
    item = schedules_table.get_item(Key={"schedule_id": schedule_id}).get("Item")
    if not item:
        raise ValueError("Schedule not found")

    schedules_table.update_item(
        Key={"schedule_id": schedule_id},
        UpdateExpression="SET #s = :s, updated_at = :u",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": new_status, ":u": now_iso()},
    )
    scheduler.update_schedule(
        Name=item["schedule_name"],
        ScheduleExpression=item["schedule_expression"],
        ScheduleExpressionTimezone=item["timezone"],
        FlexibleTimeWindow={"Mode": "OFF"},
        Target={
            "Arn": function_arn,
            "RoleArn": scheduler_role_arn(function_arn),
            "Input": json.dumps({"schedule_id": schedule_id}),
        },
        State=scheduler_state,
    )
    return {"message": f"Schedule {new_status}", "schedule_id": schedule_id}


def inactive_schedule(body, function_arn):
    return _set_schedule_state(body, function_arn, "inactive", "DISABLED")


def reactivate_schedule(body, function_arn):
    return _set_schedule_state(body, function_arn, "active", "ENABLED")


def delete_schedule(body):
    schedule_id = body.get("schedule_id")
    if not schedule_id:
        raise ValueError("schedule_id is required")
    item = schedules_table.get_item(Key={"schedule_id": schedule_id}).get("Item")
    if not item:
        raise ValueError("Schedule not found")
    scheduler.delete_schedule(Name=item["schedule_name"])
    schedules_table.delete_item(Key={"schedule_id": schedule_id})
    return {"message": "Schedule deleted", "schedule_id": schedule_id}


# ── Execution (EventBridge-Scheduler-invoked path) ──────────────────────────

def write_log(schedule_id, business_id, platform, status, message, response_data=None):
    log_id = str(uuid.uuid4())
    logs_table.put_item(Item={
        "log_id": log_id,
        "schedule_id": schedule_id,
        "businessId": business_id or "unknown",
        "platform": platform or "unknown",
        "status": status,
        "message": message,
        "response_data": response_data or {},
        "created_at": now_iso(),
    })
    return log_id


def update_schedule_status(schedule_id, status):
    schedules_table.update_item(
        Key={"schedule_id": schedule_id},
        UpdateExpression="SET last_run_status = :status, last_run_at = :t",
        ExpressionAttributeValues={":status": status, ":t": now_iso()},
    )


def execute_schedule(schedule_id):
    schedule = schedules_table.get_item(Key={"schedule_id": schedule_id}).get("Item")
    if not schedule:
        logger.error("execute_schedule: schedule not found: %s", schedule_id)
        return {"statusCode": 404, "body": "Schedule not found"}

    business_id = schedule.get("businessId", "unknown")
    platform = schedule.get("platform", "unknown")

    if schedule.get("status") != "active":
        write_log(schedule_id, business_id, platform, "skipped", "Schedule is inactive")
        return {"statusCode": 200, "body": "Schedule inactive. Skipped."}

    connection_id = schedule.get("connectionId", "primary")
    created_by = schedule.get("createdByUserId", "")

    try:
        # 1. Generate genuinely new content from the stored original input —
        # invoke() only, never reimplemented.
        gen_event = {
            "body": json.dumps({
                "input_type": schedule.get("input_type", "text"),
                "input_value": schedule.get("input_value", ""),
                "business": schedule.get("business", "My Business"),
                "content_type": schedule.get("content_type", "marketing"),
                **({"modelId": schedule["modelId"]} if schedule.get("modelId") else {}),
            }),
            "requestContext": {"authorizer": {"jwt": {"claims": {"sub": created_by}}}},
        }
        gen_raw = lambda_client.invoke(
            FunctionName="generate-marketing-asset",
            InvocationType="RequestResponse",
            Payload=json.dumps(gen_event).encode(),
        )
        gen_payload = json.loads(gen_raw["Payload"].read())
        if gen_payload.get("statusCode") != 200:
            raise RuntimeError(f"generate-marketing-asset failed: {gen_payload.get('body')}")
        gen_body = json.loads(gen_payload["body"])

        caption = gen_body.get("caption", "")
        image_url = gen_body.get("image_url", "")
        image_key = urlparse(image_url).path.lstrip("/") if image_url else None

        # 2. Publish — invoke() only, never reimplemented.
        publish_path = PUBLISH_PATHS.get(platform)
        if not publish_path:
            raise ValueError(f"Unsupported platform: {platform}")

        pub_event = {
            "requestContext": {
                "http": {"method": "POST"},
                "authorizer": {"jwt": {"claims": {"sub": created_by}}},
            },
            "rawPath": f"/dev/social/{publish_path}",
            "body": json.dumps({
                "businessId": business_id,
                "connectionId": connection_id,
                "text": caption,
                **({"image_key": image_key} if image_key else {}),
            }),
        }
        pub_raw = lambda_client.invoke(
            FunctionName="social-publish-handler-new",
            InvocationType="RequestResponse",
            Payload=json.dumps(pub_event).encode(),
        )
        pub_payload = json.loads(pub_raw["Payload"].read())
        pub_body = json.loads(pub_payload.get("body", "{}"))

        if pub_payload.get("statusCode") != 200:
            raise RuntimeError(f"publish failed: {pub_body}")

        update_schedule_status(schedule_id, "success")
        write_log(schedule_id, business_id, platform, "success", "Generated and published successfully", pub_body)

        return {"statusCode": 200, "body": json.dumps({
            "message": "Success", "schedule_id": schedule_id, "platform": platform,
        })}

    except Exception as error:
        logger.error("execute_schedule error: %s", str(error))
        try:
            update_schedule_status(schedule_id, "failed")
            write_log(schedule_id, business_id, platform, "failed", str(error))
        except Exception as log_error:
            logger.error("failed to write log: %s", str(log_error))
        raise


# ── Router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    logger.info("event: %s", json.dumps(event, default=str))

    # EventBridge Scheduler invokes with a raw payload — no requestContext,
    # no "action" key, just {"schedule_id": "..."}.
    if "requestContext" not in event and "action" not in event and event.get("schedule_id"):
        return execute_schedule(event["schedule_id"])

    # Otherwise: API-Gateway-invoked path, existing action-in-body convention.
    if "body" in event and isinstance(event.get("body"), str):
        try:
            parsed = json.loads(event["body"])
        except Exception:
            return json_response(400, {"error": "Invalid JSON body"})
        action = parsed.get("action")
        body = parsed.get("body", {})
    else:
        action = event.get("action")
        body = event.get("body", {})

    sub = get_sub_from_claims(event)
    if sub and "createdByUserId" not in body:
        body["createdByUserId"] = sub

    function_arn = context.invoked_function_arn

    try:
        if action == "create_schedule":
            result = create_schedule(body, function_arn)
        elif action == "list_schedules":
            result = list_schedules(body)
        elif action == "list_logs":
            result = list_logs(body)
        elif action == "view_schedule":
            result = view_schedule(body)
        elif action == "update_schedule":
            result = update_schedule(body, function_arn)
        elif action == "inactive_schedule":
            result = inactive_schedule(body, function_arn)
        elif action == "reactivate_schedule":
            result = reactivate_schedule(body, function_arn)
        elif action == "delete_schedule":
            result = delete_schedule(body)
        else:
            return json_response(400, {"error": f"Unknown action: {action}"})

        return json_response(200, result)

    except ValueError as e:
        return json_response(400, {"error": str(e)})
    except Exception as e:
        logger.error("lambda_handler error: %s", str(e))
        return json_response(500, {"error": str(e)})

import json
import boto3
import uuid
import logging
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table("invitation")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    "Content-Type": "application/json",
}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")

    # Strip stage prefix e.g. /dev/invitations -> /invitations
    for prefix in ["/dev", "/prod", "/staging"]:
        if raw_path.startswith(prefix + "/") or raw_path == prefix:
            raw_path = raw_path[len(prefix):]
            break

    # Route: POST /invitations
    if http_method == "POST" and raw_path == "/invitations":
        return create_invitation(event)

    # Route: GET /invitations/{invitationId}
    if http_method == "GET" and raw_path.startswith("/invitations/"):
        invitation_id = raw_path.split("/invitations/")[-1]
        if invitation_id:
            return get_invitation_by_id(invitation_id)

    # Route: GET /invitations
    if http_method == "GET" and raw_path == "/invitations":
        return get_invitations(event)

    # Route: PUT /invitations/{invitationId}
    if http_method == "PUT" and raw_path.startswith("/invitations/"):
        invitation_id = raw_path.split("/invitations/")[-1]
        if invitation_id:
            return update_invitation(event, invitation_id)

    return response(404, {"error": "Route not found"})


# ── POST /invitations ──────────────────────────────────────────────────────────

def create_invitation(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})

    required_fields = ["userEmail", "role", "invitationLink", "userName", "invitationId"]
    missing = [f for f in required_fields if not body.get(f)]
    if missing:
        return response(400, {"error": f"Missing required fields: {', '.join(missing)}"})

    # invitation_id = str(uuid.uuid4())
    created_time = datetime.now(timezone.utc).isoformat()

    item = {
        "invitationId":     body.get("invitationId", ""),
        "businessId":       body.get("businessId", ""),
        "businessName":     body.get("businessName", ""),
        "userName":         body.get("userName", ""),
        "userId":           body.get("userId", ""),
        "role":             body["role"],
        "userEmail":        body["userEmail"],
        "userPhoneNumber":  body.get("userPhoneNumber", ""),
        "invitationLink":   body["invitationLink"],
        "createdTime":      created_time,
        "status":           "Invited",
        "expirationTime":   body["expirationTime"],
    }

    try:
        table.put_item(Item=item)
    except Exception as e:
        logger.error("DynamoDB put_item error: %s", str(e))
        return response(500, {"error": "Failed to create invitation"})

    return response(201, {"message": "Invitation created", "invitation": item})


# ── GET /invitations/{invitationId} ───────────────────────────────────────────

def get_invitation_by_id(invitation_id):
    try:
        result = table.get_item(Key={"invitationId": invitation_id})
    except Exception as e:
        logger.error("DynamoDB get_item error: %s", str(e))
        return response(500, {"error": "Failed to retrieve invitation"})

    item = result.get("Item")
    if not item:
        return response(404, {"error": "Invitation not found"})

    return response(200, {"invitation": item})


# ── GET /invitations ──────────────────────────────────────────────────────────

def get_invitations(event):
    params = event.get("queryStringParameters") or {}

    business_id = params.get("businessId")
    if not business_id:
        return response(400, {"error": "businessId query parameter is required"})

    status_filter = params.get("status")
    role_filter = params.get("role")

    # Build filter expression — businessId is always required
    filter_expr = Attr("businessId").eq(business_id)

    if status_filter:
        filter_expr = filter_expr & Attr("status").eq(status_filter)
    if role_filter:
        filter_expr = filter_expr & Attr("role").eq(role_filter)

    try:
        result = table.scan(FilterExpression=filter_expr)
    except Exception as e:
        logger.error("DynamoDB scan error: %s", str(e))
        return response(500, {"error": "Failed to retrieve invitations"})

    items = result.get("Items", [])

    # Handle DynamoDB pagination
    while "LastEvaluatedKey" in result:
        try:
            result = table.scan(
                FilterExpression=filter_expr,
                ExclusiveStartKey=result["LastEvaluatedKey"],
            )
            items.extend(result.get("Items", []))
        except Exception as e:
            logger.error("DynamoDB scan pagination error: %s", str(e))
            break

    return response(200, {"invitations": items, "count": len(items)})

# ── PUT /invitations/{invitationId} ───────────────────────────────────────────
def update_invitation(event, invitation_id):

    try:
        body = json.loads(event.get("body") or "{}")

    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})

    # Verify invitation exists
    try:
        existing = table.get_item(
            Key={
                "invitationId": invitation_id
            }
        )

    except Exception as e:
        logger.error(str(e))
        return response(500, {"error": "Unable to retrieve invitation"})

    if "Item" not in existing:
        return response(404, {"error": "Invitation not found"})

    update_expression = []
    expression_values = {}
    expression_names = {}

    allowed_fields = [
        "businessId",
        "businessName",
        "userName",
        "userId",
        "userEmail",
        "userPhoneNumber",
        "role",
        "status",
        "expirationTime",
        "invitationLink"
    ]

    for field in allowed_fields:

        if field in body:

            update_expression.append(f"#{field} = :{field}")

            expression_names[f"#{field}"] = field

            expression_values[f":{field}"] = body[field]

    if not update_expression:
        return response(400, {
            "error": "No valid fields supplied for update"
        })

    # Update timestamp
    update_expression.append("#updatedTime = :updatedTime")

    expression_names["#updatedTime"] = "updatedTime"

    expression_values[":updatedTime"] = datetime.now(
        timezone.utc
    ).isoformat()

    try:

        result = table.update_item(

            Key={
                "invitationId": invitation_id
            },

            UpdateExpression="SET " + ", ".join(update_expression),

            ExpressionAttributeNames=expression_names,

            ExpressionAttributeValues=expression_values,

            ReturnValues="ALL_NEW"

        )

    except Exception as e:

        logger.error(str(e))

        return response(
            500,
            {"error": "Failed to update invitation"}
        )

    return response(
        200,
        {
            "message": "Invitation updated successfully",
            "invitation": result["Attributes"]
        }
    )
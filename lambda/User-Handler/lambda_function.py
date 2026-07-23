import os
import json
import uuid
import boto3
from datetime import datetime

# ── DynamoDB setup ──────────────────────────────────────────────────────────────
dynamodb    = boto3.resource("dynamodb")
table       = dynamodb.Table(os.environ["USER_TABLE"])
audit_table = dynamodb.Table("AuditEvent")

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps(body),
    }


def get_caller_id(event):
    """Extract caller's sub from JWT claims."""
    try:
        return (
            event.get("requestContext", {})
                 .get("authorizer", {})
                 .get("jwt", {})
                 .get("claims", {})
                 .get("sub")
        )
    except Exception:
        return "unknown"


def write_audit_event(action, user_id, entity_id, result="SUCCESS", metadata=None):
    """Write an immutable audit event to AuditEvent table."""
    try:
        event_id = "EVT-" + str(uuid.uuid4())[:8].upper()
        item = {
            "eventId":   event_id,
            "action":    action,
            "userId":    user_id or "unknown",
            "entityId":  entity_id,
            "result":    result,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if metadata:
            item["metadata"] = metadata
        audit_table.put_item(Item=item)
        print(f"Wrote audit event: {event_id} action={action} entity={entity_id}")
    except Exception as e:
        print(f"Failed to write audit event: {str(e)}")


# ── Router ───────────────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    method = event["requestContext"]["http"]["method"]

    if method == "OPTIONS":
        return response(200, {})
    elif method == "POST":
        return create_user(event)
    elif method == "GET":
        path_params = event.get("pathParameters") or {}
        if path_params.get("userId"):
            return get_user_by_id(event)
        return get_users(event)
    elif method == "PUT":
        return update_user(event)
    elif method == "DELETE":
        return delete_user(event)
    else:
        return response(405, {"error": f"Method {method} not allowed"})


# ── POST /users ──────────────────────────────────────────────────────────────────
def create_user(event):
    caller_id = get_caller_id(event)
    try:
        body = json.loads(event.get("body") or "{}")

        required = ["businessId", "email", "role", "displayName"]
        missing = [f for f in required if not body.get(f)]
        if missing:
            return response(400, {"error": f"Missing required fields: {', '.join(missing)}"})

        valid_roles = ["ADMIN", "EDITOR", "VIEWER"]
        if body["role"] not in valid_roles:
            return response(400, {"error": f"role must be one of: {', '.join(valid_roles)}"})

        user_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        item = {
            "businessId":  body["businessId"],
            "userId":      body.get("userId") or user_id,
            "email":       body["email"],
            "phoneNumber": body.get("phoneNumber", ""),
            "role":        body["role"],
            "displayName": body["displayName"],
            "status":      "ACTIVE",
            "createdAt":   now,
            "updatedAt":   now,
        }

        table.put_item(Item=item)

        write_audit_event(
            action="ADD_USER",
            user_id=caller_id,
            entity_id=item["userId"],
            result="SUCCESS",
            metadata={
                "businessId":  body["businessId"],
                "email":       body["email"],
                "role":        body["role"],
                "displayName": body["displayName"],
            }
        )

        return response(201, {"message": "User created", "user": item})

    except Exception as e:
        print(f"[create_user] Error: {e}")
        write_audit_event(
            action="ADD_USER",
            user_id=caller_id,
            entity_id="unknown",
            result="FAIL",
            metadata={"error": str(e)}
        )
        return response(500, {"error": str(e)})


# ── GET /users?businessId=BUS001 ─────────────────────────────────────────────────
def get_users(event):
    try:
        params = event.get("queryStringParameters") or {}
        business_id = params.get("businessId")

        if not business_id:
            return response(400, {"error": "businessId query param is required."})

        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("businessId").eq(business_id)
        )

        users = result.get("Items", [])
        return response(200, {"users": users, "count": len(users)})

    except Exception as e:
        print(f"[get_users] Error: {e}")
        return response(500, {"error": str(e)})


# ── GET /users/{userId}?businessId=BUS001 ────────────────────────────────────────
def get_user_by_id(event):
    try:
        params = event.get("queryStringParameters") or {}
        path   = event.get("pathParameters") or {}

        business_id = params.get("businessId")
        user_id     = path.get("userId")

        if not business_id:
            return response(400, {"error": "businessId query parameter is required"})
        if not user_id:
            return response(400, {"error": "userId path parameter is required"})

        result = table.get_item(Key={"businessId": business_id, "userId": user_id})
        item   = result.get("Item")

        if not item:
            return response(404, {"error": "User not found"})

        return response(200, {"user": item})

    except Exception as e:
        print(f"[get_user_by_id] Error: {e}")
        return response(500, {"error": str(e)})


# ── PUT /users/{userId} ──────────────────────────────────────────────────────────
def update_user(event):
    caller_id = get_caller_id(event)
    try:
        body = json.loads(event.get("body") or "{}")

        old_user_id = (event.get("pathParameters") or {}).get("userId")
        business_id = body.get("businessId")

        if not business_id or not old_user_id:
            return response(400, {"error": "businessId and userId are required"})

        result = table.get_item(Key={"businessId": business_id, "userId": old_user_id})

        if "Item" not in result:
            return response(404, {"error": "User not found"})

        item = result["Item"]
        new_user_id = body.get("userId", old_user_id)

        if "email" in body:
            item["email"] = body["email"]
        if "displayName" in body:
            item["displayName"] = body["displayName"]
        if "phoneNumber" in body:
            item["phoneNumber"] = body["phoneNumber"]
        if "status" in body:
            item["status"] = body["status"]
        if "role" in body:
            valid_roles = ["ADMIN", "EDITOR", "VIEWER"]
            if body["role"] not in valid_roles:
                return response(400, {"error": f"role must be one of: {', '.join(valid_roles)}"})
            item["role"] = body["role"]

        item["updatedAt"] = datetime.utcnow().isoformat()
        item["userId"]    = new_user_id

        table.put_item(Item=item)

        if new_user_id != old_user_id:
            table.delete_item(Key={"businessId": business_id, "userId": old_user_id})

        write_audit_event(
            action="UPDATE_USER",
            user_id=caller_id,
            entity_id=new_user_id,
            result="SUCCESS",
            metadata={
                "businessId":    business_id,
                "updatedFields": [k for k in ["email", "displayName", "phoneNumber", "status", "role"] if k in body],
            }
        )

        return response(200, {"message": "User updated successfully", "user": item})

    except Exception as e:
        print(f"[update_user] Error: {e}")
        write_audit_event(
            action="UPDATE_USER",
            user_id=caller_id,
            entity_id=(event.get("pathParameters") or {}).get("userId", "unknown"),
            result="FAIL",
            metadata={"error": str(e)}
        )
        return response(500, {"error": str(e)})


# ── DELETE /users/{userId} ────────────────────────────────────────────────────────
def delete_user(event):
    caller_id = get_caller_id(event)
    try:
        params      = event.get("queryStringParameters") or {}
        body        = json.loads(event.get("body") or "{}")
        user_id     = (event.get("pathParameters") or {}).get("userId")
        business_id = params.get("businessId") or body.get("businessId")

        if not business_id or not user_id:
            return response(400, {"error": "userId is required in the URL and businessId is required"})

        table.delete_item(
            Key={"businessId": business_id, "userId": user_id},
            ConditionExpression="attribute_exists(businessId)",
        )

        write_audit_event(
            action="DELETE_USER",
            user_id=caller_id,
            entity_id=user_id,
            result="SUCCESS",
            metadata={
                "businessId":    business_id,
                "deletedUserId": user_id,
            }
        )

        return response(200, {"message": f"User {user_id} deleted"})

    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return response(404, {"error": "User not found"})
    except Exception as e:
        print(f"[delete_user] Error: {e}")
        write_audit_event(
            action="DELETE_USER",
            user_id=caller_id,
            entity_id=user_id if 'user_id' in locals() else "unknown",
            result="FAIL",
            metadata={"error": str(e)}
        )
        return response(500, {"error": str(e)})

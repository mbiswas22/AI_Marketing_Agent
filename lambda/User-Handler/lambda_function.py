import os
import json
import uuid
import boto3
from datetime import datetime

# ── DynamoDB setup ──────────────────────────────────────────────────────────────
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["USER_TABLE"])

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
            "businessId": body["businessId"],   # PK
            "userId":     body.get("userId") or user_id,   # SK
            "email":      body["email"],
            "phoneNumber": body.get("phoneNumber", ""),
            "role":       body["role"],
            "displayName": body["displayName"],
            "status":     "ACTIVE",
            "createdAt":  now,
            "updatedAt":  now,
        }

        table.put_item(Item=item)
        return response(201, {"message": "User created", "user": item})

    except Exception as e:
        print(f"[create_user] Error: {e}")
        return response(500, {"error": str(e)})

# ── GET /users?businessId=BUS001 ─────────────────────────────────────────────────
def get_users(event):
    try:
        params = event.get("queryStringParameters") or {}
        business_id = params.get("businessId")

        if not business_id:
            return response(400, {"error": "businessId query param is required. Example: GET /users?businessId=BUS001"})

        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("businessId").eq(business_id)
        )

        users = result.get("Items", [])
        return response(200, {"users": users, "count": len(users)})

    except Exception as e:
        print(f"[get_users] Error: {e}")
        return response(500, {"error": str(e)})

# ── GET /users/{userId}?businessId=BUS001 ─────────────────────────────────────────────────
def get_user_by_id(event):
    try:
        params = event.get("queryStringParameters") or {}
        path = event.get("pathParameters") or {}

        business_id = params.get("businessId")
        user_id = path.get("userId")

        if not business_id:
            return response(
                400,
                {
                    "error": "businessId query parameter is required"
                }
            )

        if not user_id:
            return response(
                400,
                {
                    "error": "userId path parameter is required"
                }
            )

        result = table.get_item(
            Key={
                "businessId": business_id,
                "userId": user_id
            }
        )

        item = result.get("Item")

        if not item:
            return response(
                404,
                {
                    "error": "User not found"
                }
            )

        return response(
            200,
            {
                "user": item
            }
        )

    except Exception as e:
        print(f"[get_user_by_id] Error: {e}")
        return response(
            500,
            {
                "error": str(e)
            }
        )

# ── PUT /users/{userId} ──────────────────────────────────────────────────────────
# userId comes from URL, businessId comes from body
def update_user(event):
    try:
        body = json.loads(event.get("body") or "{}")

        # Existing key
        old_user_id = (event.get("pathParameters") or {}).get("userId")
        business_id = body.get("businessId")

        if not business_id or not old_user_id:
            return response(
                400,
                {
                    "error": "businessId and userId are required"
                }
            )

        # Read existing record
        result = table.get_item(
            Key={
                "businessId": business_id,
                "userId": old_user_id
            }
        )

        if "Item" not in result:
            return response(
                404,
                {
                    "error": "User not found"
                }
            )

        item = result["Item"]

        # New userId (optional)
        new_user_id = body.get("userId", old_user_id)

        # Update editable fields
        if "email" in body:
            item["email"] = body["email"]

        if "displayName" in body:
            item["displayName"] = body["displayName"]

        if "phoneNumber" in body:
            item["phoneNumber"] = body["phoneNumber"]

        if "status" in body:
            item["status"] = body["status"]

        if "role" in body:

            valid_roles = [
                "ADMIN",
                "EDITOR",
                "VIEWER"
            ]

            if body["role"] not in valid_roles:
                return response(
                    400,
                    {
                        "error": f"role must be one of: {', '.join(valid_roles)}"
                    }
                )

            item["role"] = body["role"]

        # Update timestamp
        item["updatedAt"] = datetime.utcnow().isoformat()

        # Change Sort Key if requested
        item["userId"] = new_user_id

        # Save new item
        table.put_item(
            Item=item
        )

        # Delete old item if key changed
        if new_user_id != old_user_id:

            table.delete_item(
                Key={
                    "businessId": business_id,
                    "userId": old_user_id
                }
            )

        return response(
            200,
            {
                "message": "User updated successfully",
                "user": item
            }
        )

    except Exception as e:
        print(f"[update_user] Error: {e}")
        return response(
            500,
            {
                "error": str(e)
            }
        )

# ── DELETE /users/{userId} ────────────────────────────────────────────────────────
# userId comes from URL, businessId comes from body
def delete_user(event):
    try:
        params = event.get("queryStringParameters") or {}
        body = json.loads(event.get("body") or "{}")

        user_id = (event.get("pathParameters") or {}).get("userId")
        business_id = params.get("businessId") or body.get("businessId")

        if not business_id or not user_id:
            return response(400, {"error": "userId is required in the URL and businessId is required in the body"})

        table.delete_item(
            Key={"businessId": business_id, "userId": user_id},
            ConditionExpression="attribute_exists(businessId)",
        )

        return response(200, {"message": f"User {user_id} deleted"})

    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return response(404, {"error": "User not found"})
    except Exception as e:
        print(f"[delete_user] Error: {e}")
        return response(500, {"error": str(e)})
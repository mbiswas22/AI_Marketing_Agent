import os
import json
import uuid
import random
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

# ───────────────────────────────────────────────────────────────
# AWS clients & tables
# ───────────────────────────────────────────────────────────────
dynamodb = boto3.resource("dynamodb")

BUSINESS_TABLE_NAME = os.environ["BUSINESS_TABLE"]
USER_TABLE_NAME = os.environ["USER_TABLE"]
CHANNEL_TABLE_NAME = os.environ["CHANNEL_TABLE"]
CONTENT_TYPE_TABLE_NAME = os.environ["CONTENT_TYPE_TABLE"]
MODEL_TABLE_NAME = os.environ["MODEL_TABLE"]

business_table = dynamodb.Table(BUSINESS_TABLE_NAME)
user_table = dynamodb.Table(USER_TABLE_NAME)
channel_table = dynamodb.Table(CHANNEL_TABLE_NAME)
content_type_table = dynamodb.Table(CONTENT_TYPE_TABLE_NAME)
model_table = dynamodb.Table(MODEL_TABLE_NAME)

# ───────────────────────────────────────────────────────────────
# HTTP helpers
# ───────────────────────────────────────────────────────────────
HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}

def response(status, body):
    return {
        "statusCode": status,
        "headers": HEADERS,
        "body": json.dumps(body),
    }

def parse_json_body(event):
    try:
        return json.loads(event.get("body") or "{}")
    except:
        return {}

def get_http_method(event):
    try:
        return event["requestContext"]["http"]["method"]
    except:
        return event.get("httpMethod", "")

def get_path_param(event, name):
    return (event.get("pathParameters") or {}).get(name)

def get_query_param(event, name):
    return (event.get("queryStringParameters") or {}).get(name)

def resolve_business_id(event, body=None):
    return (
        get_path_param(event, "businessId")
        or get_query_param(event, "businessId")
        or (body or {}).get("businessId")
    )

def get_sub_from_claims(event):
    return (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
             .get("sub")
    )

# ───────────────────────────────────────────────────────────────
# Router
# ───────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    method = get_http_method(event)

    if method == "OPTIONS":
        return response(200, {})

    if method == "POST":
        return create_business(event)
    if method == "GET":
        return get_business(event)
    if method == "PUT":
        return update_business(event)
    if method == "DELETE":
        return deactivate_business(event)

    return response(405, {"error": f"Method {method} not allowed"})

# ───────────────────────────────────────────────────────────────
# POST /business — Create Business + First User + Defaults
# ───────────────────────────────────────────────────────────────
def create_business(event):
    try:
        body = parse_json_body(event)

        required = ["businessName", "ownerEmail", "ownerName", "businessId"]
        missing = [f for f in required if not body.get(f)]
        if missing:
            return response(400, {"error": f"Missing required fields: {', '.join(missing)}"})

        # business_id = f"bz-{random.randint(100, 999)}"
        business_id = body.get("businessId", "")
        created_at = datetime.utcnow().isoformat()

        business_item = {
            "parentBusinessId": body.get("businessId", ""),
            "businessId": business_id, # TODO:generate proper bussiness ID
            "businessType": body.get("businessType", ""),
            "businessName": body["businessName"],
            "createdAt": created_at,
            "defaultModels": body.get("defaultModels", ""),
            "phone": body.get("phone", ""),
            "region": body.get("region", ""),
            "status": "ACTIVE",

            # NEW FIELDS ADDED
            "ownerName": body["ownerName"],
            "ownerEmail": body["ownerEmail"]
        }

        business_table.put_item(Item=business_item)

        # Create first admin user
        # user_id = str(uuid.uuid4())
        # user_item = {
        #     "businessId": business_id,
        #     "userId": user_id,
        #     "createdAt": created_at,
        #     "displayName": body["ownerName"],
        #     "email": body["ownerEmail"],
        #     "role": "admin",
        #     "status": "active",
        # }
        # user_table.put_item(Item=user_item)

        # Default channels
        channels = [
            {"id": "web", "name": "website"},
            {"id": "robot", "name": "robot"},
            {"id": "social", "name": "social"},
            {"id": "print", "name": "print"},
        ]
        for ch in channels:
            channel_table.put_item(Item={
                "businessId": business_id,
                "channelId": ch["id"],
                "channelName": ch["name"],
                "enabled": True,
            })

        # Default content types
        content_types = [
            {"name": "image", "model": "titan-image", "format": "png"},
            {"name": "video", "model": "titan-video", "format": "mp4"},
            {"name": "flyer", "model": "titan-image", "format": "png"},
            {"name": "caption", "model": "claude-sonnet", "format": "text"},
        ]
        for ct in content_types:
            content_type_table.put_item(Item={
                "businessId": business_id,
                "contentTypeName": ct["name"],
                "defaultmodelId": ct["model"],
                "enabled": True,
                "outputFormat": ct["format"],
            })

        # Default models
        models = [
            {"name": "claude-sonnet", "bedrock": "model#nova-2", "cost": "0.20"},
            {"name": "titan-image", "bedrock": "stability.stable-image-core-v1:1", "cost": "0.10"},
            {"name": "titan-video", "bedrock": "amazon.titan-video-v1", "cost": "0.15"},
        ]
        for m in models:
            model_table.put_item(Item={
                "businessId": business_id,
                "modelName": m["name"],
                "bedrockmodelId": m["bedrock"],
                "costperToken": m["cost"],
                "enabled": True,
            })

        # return response(201, {
        #     "message": "Business created successfully",
        #     "business": business_item,
        #     "ownerUser": user_item,
        # })

        return response(201, {
            "message": "Business created successfully",
            "business": business_item,
        })

    except Exception as e:
        print("[create_business] Error:", e)
        return response(500, {"error": "Internal server error"})

# ───────────────────────────────────────────────────────────────
# GET /business              → list all businesses
# GET /business?businessId=  → get single business
# ───────────────────────────────────────────────────────────────
def get_business(event):
    try:
        business_id = get_query_param(event, "businessId")

        if business_id:
            result = business_table.get_item(Key={"businessId": business_id})
            if "Item" not in result:
                return response(404, {"error": "Business not found"})
            return response(200, {"business": result["Item"]})
        else:
            # Only return businesses the caller actually belongs to, via the
            # user table's userId-index GSI (real Cognito sub -> membership
            # rows) — previously this scanned and returned every business in
            # the system unfiltered, which breaks for any business with more
            # than one real admin (whoever's ownerEmail matched "won").
            sub = get_sub_from_claims(event)
            if not sub:
                return response(200, [])

            memberships = user_table.query(
                IndexName="userId-index",
                KeyConditionExpression=Key("userId").eq(sub),
            ).get("Items", [])

            businesses = []
            for m in memberships:
                biz_id = m.get("businessId")
                if not biz_id:
                    continue
                biz = business_table.get_item(Key={"businessId": biz_id}).get("Item")
                if biz:
                    businesses.append(biz)

            return response(200, businesses)

    except Exception as e:
        print("[get_business] Error:", e)
        return response(500, {"error": "Internal server error"})

# ───────────────────────────────────────────────────────────────
# PUT /business/{businessId} — FULL FIELD UPDATE
# ───────────────────────────────────────────────────────────────
def update_business(event):
    try:
        body = parse_json_body(event)
        business_id = resolve_business_id(event, body)

        if not business_id:
            return response(400, {"error": "businessId is required"})

        updates = {k: v for k, v in body.items() if k != "businessId"}
        if not updates:
            return response(400, {"error": "No fields provided to update"})

        update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
        expr_names = {f"#{k}": k for k in updates}
        expr_values = {f":{k}": v for k, v in updates.items()}

        result = business_table.update_item(
            Key={"businessId": business_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression="attribute_exists(businessId)",
            ReturnValues="ALL_NEW",
        )

        return response(200, {
            "message": "Business updated",
            "business": result["Attributes"],
        })

    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return response(404, {"error": "Business not found"})
    except Exception as e:
        print("[update_business] Error:", e)
        return response(500, {"error": "Internal server error"})

# ───────────────────────────────────────────────────────────────
# DELETE /business/{businessId} — FULL MULTI-TABLE DELETE
# ───────────────────────────────────────────────────────────────
def deactivate_business(event):
    try:
        body = parse_json_body(event)
        business_id = resolve_business_id(event, body)

        if not business_id:
            return response(400, {"error": "businessId is required"})

        business_table.delete_item(
            Key={"businessId": business_id},
            ConditionExpression="attribute_exists(businessId)",
        )

        users = user_table.query(
            KeyConditionExpression=Key("businessId").eq(business_id)
        ).get("Items", [])
        for u in users:
            user_table.delete_item(Key={"businessId": business_id, "userId": u["userId"]})

        channels = channel_table.query(
            KeyConditionExpression=Key("businessId").eq(business_id)
        ).get("Items", [])
        for ch in channels:
            channel_table.delete_item(Key={"businessId": business_id, "channelId": ch["channelId"]})

        content_types = content_type_table.query(
            KeyConditionExpression=Key("businessId").eq(business_id)
        ).get("Items", [])
        for ct in content_types:
            content_type_table.delete_item(Key={"businessId": business_id, "contentTypeName": ct["contentTypeName"]})

        models = model_table.query(
            KeyConditionExpression=Key("businessId").eq(business_id)
        ).get("Items", [])
        for m in models:
            model_table.delete_item(Key={"businessId": business_id, "modelName": m["modelName"]})

        return response(200, {
            "message": f"Business {business_id} and all related items deleted"
        })

    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return response(404, {"error": "Business not found"})
    except Exception as e:
        print("[delete_business] FINAL ERROR:", e)
        return response(500, {"error": "Internal server error"})
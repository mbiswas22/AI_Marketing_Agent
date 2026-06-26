import json
import uuid
import os
import boto3
import base64
from datetime import datetime
from auth import get_user
from response import api_response
from authorization import require_role

# ============================================================
# AWS Clients
# ============================================================


dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table(os.environ["DYNAMO_TABLE"])

s3 = boto3.client("s3", region_name="us-east-2")
BUCKET = os.environ["S3_BUCKET"]

# Text model — Nova Micro lives in us-east-1; use cross-region profile
bedrock_text = boto3.client("bedrock-runtime", region_name="us-east-1")

# Image model — Stability SD3.5 only available in us-west-2
bedrock_image = boto3.client("bedrock-runtime", region_name="us-west-2")

# ============================================================
# Lambda Handler
# ============================================================

def lambda_handler(event, context):
    try:
        body = json.loads(event["body"])

        user = get_user(event)
        print(f"Genarate_caption: User ID: {user}")
        user_id = user['user_id']

        action_id = str(uuid.uuid4())
        business = body.get("business", "My Business")
        prompt = body.get("prompt", "")
        platforms = body.get("platforms", [])

        flyer = generate_flyer_content(business, prompt, platforms)

        image_bytes = generate_flyer_image(flyer["image_prompt"])

        s3_key = f"flyers/{user_id}/{action_id}.png"

        s3.put_object(
            Bucket=BUCKET,
            Key=s3_key,
            Body=image_bytes,
            ContentType="image/png"
        )

        image_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": s3_key},
            ExpiresIn=86400
        )

        TEXT_MODEL = os.environ.get("TEXT_MODEL", "us.amazon.nova-micro-v1:0")
        IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "stability.sd3-5-large-v1:0")

        table.put_item(
            Item={
                "action_id": action_id,
                "user_id": user_id,
                "business": business,
                "prompt": prompt,
                "platforms": platforms,
                "text_model": TEXT_MODEL,
                "image_model": IMAGE_MODEL,
                "title": flyer["title"],
                "caption": flyer["caption"],
                "offer": flyer["offer"],
                "call_to_action": flyer["call_to_action"],
                "image_prompt": flyer["image_prompt"],
                "image_url": image_url,
                "s3_key": s3_key,
                "status": "generated",
                "created_at": datetime.utcnow().isoformat()
            }
        )

        return api_response(200, {
            "action_id": action_id,
            "title": flyer["title"],
            "caption": flyer["caption"],
            "offer": flyer["offer"],
            "call_to_action": flyer["call_to_action"],
            "image_url": image_url
        })

    except Exception as e:
        print("ERROR:", str(e))
        return api_response(500, {"error": str(e)})


# ============================================================
# Generate Flyer Text
# ============================================================

def generate_flyer_content(business, prompt, platforms):

    # Cross-region inference profile — required for Nova models outside us-east-1
    TEXT_MODEL = os.environ.get("TEXT_MODEL", "us.amazon.nova-micro-v1:0")

    platforms_str = ", ".join(platforms) if platforms else "social media"

    marketing_prompt = f"""
Create a professional marketing flyer.

Business: {business}

Campaign Details:
{prompt}

Target Platforms:
{platforms_str}

Return ONLY valid JSON:

{{
  "title":"Flyer headline",
  "caption":"Marketing flyer content",
  "offer":"Special offer text",
  "call_to_action":"Short CTA",
  "image_prompt":"Detailed flyer background image description"
}}
"""
    print(f"Using text model: {TEXT_MODEL}")
    response = bedrock_text.converse(   # <-- us-east-1 client
        modelId=TEXT_MODEL,
        messages=[{"role": "user", "content": [{"text": marketing_prompt}]}],
        inferenceConfig={"maxTokens": 1000, "temperature": 0.7}
    )

    text = response["output"]["message"]["content"][0]["text"].strip()

    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    return json.loads(text)


# ============================================================
# Generate Flyer Image
# ============================================================

def generate_flyer_image(image_prompt):

    IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "stability.sd3-5-large-v1:0")

    request_body = {
        "prompt": image_prompt,
        "mode": "text-to-image",
        "aspect_ratio": "1:1",
        "output_format": "png"
    }

    print(f"Generating image with {IMAGE_MODEL}")
    response = bedrock_image.invoke_model(   # <-- us-west-2 client
        modelId=IMAGE_MODEL,
        body=json.dumps(request_body),
        contentType="application/json",
        accept="application/json"
    )

    result = json.loads(response["body"].read())
    return base64.b64decode(result["images"][0])


# ============================================================
# API Response
# ============================================================

def api_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Content-Type": "application/json"
        },
        "body": json.dumps(body, default=str)
    }
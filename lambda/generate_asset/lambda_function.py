import json
import uuid
import os
import boto3
import base64
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

# AWS Clients
s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

bedrock_text = boto3.client(
    "bedrock-runtime",
    region_name="us-east-1"
)

bedrock_image = boto3.client(
    "bedrock-runtime",
    region_name="us-west-2"
)

# Environment Variables
BUCKET = os.environ["S3_BUCKET"]
TABLE_NAME = os.environ["DYNAMO_TABLE"]

table = dynamodb.Table(TABLE_NAME)

# Default image model
DEFAULT_IMAGE_MODEL = "stability.stable-image-ultra-v1:1"


def lambda_handler(event, context):

    try:

        print(json.dumps(event, default=str))

        body = json.loads(event.get("body", "{}"))

        action_id = str(uuid.uuid4())

        # Works with or without Cognito
        # user_id = (
        #     event.get("requestContext", {})
        #     .get("authorizer", {})
        #     .get("jwt", {})
        #     .get("claims", {})
        #     .get("sub", "anonymous-user")
        # )

        user_id = "anonymous-user"

        input_type = body.get("input_type", "text")
        input_value = body.get("input_value", "")

        business = body.get("business", "My Business")
        content_type = body.get("content_type", "marketing")
        
        # Get the image model from UI (optional)
        image_model_id = body.get("modelId", DEFAULT_IMAGE_MODEL)

        # ---------------------------------------------------
        # IMAGE UPLOAD
        # ---------------------------------------------------

        if input_type == "image" and body.get("image_data"):

            image_bytes = base64.b64decode(
                body["image_data"]
            )

            upload_key = (
                f"uploads/{user_id}/{action_id}.png"
            )

            s3.put_object(
                Bucket=BUCKET,
                Key=upload_key,
                Body=image_bytes,
                ContentType="image/png"
            )

            input_value = upload_key

        # ---------------------------------------------------
        # GENERATE MARKETING CONTENT (for image prompt only)
        # ---------------------------------------------------

        marketing_data = generate_marketing_content(
            input_type=input_type,
            input_value=input_value,
            business=business,
            content_type=content_type
        )

        image_prompt = marketing_data["image_prompt"]

        # ---------------------------------------------------
        # GENERATE IMAGE (using selected model)
        # ---------------------------------------------------

        image_bytes = generate_image(image_prompt, image_model_id)

        image_key = (
            f"generated/{user_id}/{action_id}.png"
        )

        s3.put_object(
            Bucket=BUCKET,
            Key=image_key,
            Body=image_bytes,
            ContentType="image/png"
        )

        image_url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": BUCKET,
                "Key": image_key
            },
            ExpiresIn=86400
        )

        # ---------------------------------------------------
        # SAVE HISTORY
        # ---------------------------------------------------

        created_at = datetime.utcnow().isoformat()

        table.put_item(
            Item={
                "action_id": action_id,
                "user_id": user_id,
                "business": business,
                "content_type": content_type,
                "input_type": input_type,
                "input_value": input_value,
                "caption": marketing_data["caption"],
                "hashtags": marketing_data["hashtags"],
                "image_prompt": image_prompt,
                "image_key": image_key,
                "image_model": image_model_id,  # Save which image model was used
                "status": "draft",
                "created_at": created_at
            }
        )

        return api_response(
            200,
            {
                "action_id": action_id,
                "caption": marketing_data["caption"],
                "hashtags": marketing_data["hashtags"],
                "image_prompt": image_prompt,
                "image_url": image_url,
                "image_model": image_model_id,
                "status": "draft",
                "created_at": created_at
            }
        )

    except Exception as e:

        print(str(e))

        return api_response(
            500,
            {
                "error": str(e)
            }
        )


# ============================================================
# Generate Marketing Content
# ============================================================

def generate_marketing_content(
    input_type,
    input_value,
    business,
    content_type
):

    if input_type == "website":
        context = crawl_website(input_value)

    elif input_type == "image":
        context = (
            f"User uploaded a product image "
            f"stored in S3 at {input_value}."
        )

    else:  # text input
        context = input_value

    prompt = f"""
You are a marketing expert.

Business:
{business}

Content Type:
{content_type}

Context:
{context}

Create marketing content.

Return ONLY JSON:

{{
  "caption": "...",
  "hashtags": ["#one","#two"],
  "image_prompt": "Detailed image generation prompt"
}}
"""

    response = bedrock_text.converse(
        modelId="amazon.nova-lite-v1:0",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        inferenceConfig={
            "maxTokens": 1000,
            "temperature": 0.7
        }
    )

    text = (
        response["output"]["message"]["content"][0]["text"]
    )

    try:

        return json.loads(text)

    except Exception:

        return {
            "caption": f"Marketing content for {business}",
            "hashtags": [
                "#marketing",
                "#business"
            ],
            "image_prompt": (
                f"Professional marketing image for "
                f"{business}, modern branding, "
                f"advertising photography, studio lighting"
            )
        }


# ============================================================
# Generate Image
# ============================================================

def generate_image(image_prompt, model_id=None):

    if model_id is None:
        model_id = DEFAULT_IMAGE_MODEL

    response = bedrock_image.invoke_model(
        modelId=model_id,
        body=json.dumps(
            {
                "prompt": image_prompt,
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
                "output_format": "png"
            }
        ),
        contentType="application/json",
        accept="application/json"
    )

    result = json.loads(
        response["body"].read()
    )

    return base64.b64decode(
        result["images"][0]
    )


# ============================================================
# Website Crawl
# ============================================================

def crawl_website(url):

    try:

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0"
            }
        )

        with urllib.request.urlopen(
            req,
            timeout=10
        ) as response:

            html = response.read().decode(
                "utf-8",
                errors="ignore"
            )

        return html[:5000]

    except Exception as e:

        print(str(e))

        return (
            f"Website URL: {url}"
        )


# ============================================================
# API Response
# ============================================================

def api_response(status_code, body):

    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
                "Content-Type,Authorization",
            "Access-Control-Allow-Methods":
                "POST,OPTIONS",
            "Content-Type":
                "application/json"
        },
        "body": json.dumps(
            body,
            default=str
        )
    }
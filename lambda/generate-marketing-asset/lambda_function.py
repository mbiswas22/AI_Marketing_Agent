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
BUCKET     = os.environ["S3_BUCKET"]
TABLE_NAME = os.environ["DYNAMO_TABLE"]

table = dynamodb.Table(TABLE_NAME)

DEFAULT_IMAGE_MODEL = "stability.stable-image-ultra-v1:1"


def lambda_handler(event, context):

    try:

        print(json.dumps(event, default=str))

        body = json.loads(event.get("body", "{}"))

        action_id = str(uuid.uuid4())

        # Pull user_id from Cognito JWT claims if available, else anonymous
        user_id = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub", "anonymous-user")
        )

        input_type    = body.get("input_type", "text")
        input_value   = body.get("input_value", "")
        business      = body.get("business", "My Business")
        content_type  = body.get("content_type", "marketing")
        output_format = body.get("output_format", "plain_text")
        image_model_id = body.get("modelId", DEFAULT_IMAGE_MODEL)

        # FIX: capture the original user-typed prompt BEFORE input_value
        # gets overwritten with an S3 key during image uploads
        original_prompt = body.get("prompt", input_value)

        # ---------------------------------------------------
        # IMAGE UPLOAD — overwrites input_value with S3 key
        # but original_prompt is already saved above
        # ---------------------------------------------------

        if input_type == "image" and body.get("image_data"):

            image_bytes = base64.b64decode(body["image_data"])

            upload_key = f"uploads/{user_id}/{action_id}.png"

            s3.put_object(
                Bucket=BUCKET,
                Key=upload_key,
                Body=image_bytes,
                ContentType="image/png"
            )

            input_value = upload_key  # S3 key stored separately, prompt preserved above

        # ---------------------------------------------------
        # GENERATE MARKETING CONTENT
        # ---------------------------------------------------

        marketing_data = generate_marketing_content(
            input_type=input_type,
            input_value=input_value,
            business=business,
            content_type=content_type
        )

        image_prompt = marketing_data["image_prompt"]

        # ---------------------------------------------------
        # GENERATE IMAGE
        # ---------------------------------------------------

        image_bytes = generate_image(image_prompt, image_model_id)

        image_key = f"generated/{user_id}/{action_id}.png"

        s3.put_object(
            Bucket=BUCKET,
            Key=image_key,
            Body=image_bytes,
            ContentType="image/png"
        )

        image_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": image_key},
            ExpiresIn=86400
        )

        # ---------------------------------------------------
        # SAVE TO DYNAMODB
        # FIX: store original_prompt separately from input_value
        # FIX: store real content_type from request body
        # ---------------------------------------------------

        created_at = datetime.utcnow().isoformat()

        table.put_item(
            Item={
                "action_id":     action_id,
                "user_id":       user_id,
                "business":      business,
                "content_type":  content_type,   # FIX: now stores real value e.g. "flyer", "blog"
                "output_format": output_format,
                "input_type":    input_type,
                "input_value":   input_value,    # S3 key if image, original text if text/website
                "prompt":        original_prompt, # FIX: always stores what user typed
                "caption":       marketing_data["caption"],
                "hashtags":      marketing_data["hashtags"],
                "image_prompt":  image_prompt,
                "image_key":     image_key,
                "image_model":   image_model_id,
                "status":        "draft",
                "created_at":    created_at
            }
        )

        return api_response(
            200,
            {
                "action_id":    action_id,
                "caption":      marketing_data["caption"],
                "hashtags":     marketing_data["hashtags"],
                "image_prompt": image_prompt,
                "image_url":    image_url,
                "image_model":  image_model_id,
                "content_type": content_type,   # FIX: return it so frontend can confirm
                "prompt":       original_prompt, # FIX: return original prompt
                "status":       "draft",
                "created_at":   created_at
            }
        )

    except Exception as e:

        print(str(e))

        return api_response(500, {"error": str(e)})


# ============================================================
# Generate Marketing Content
# Adapts the AI prompt based on content_type
# ============================================================

CONTENT_TYPE_INSTRUCTIONS = {
    "flyer":               "Create a marketing flyer with a bold headline, short punchy caption, offer, and clear call to action.",
    "blog":                "Create a blog post outline with a title, intro, 3-5 key sections, and a closing call to action.",
    "email":               "Create a marketing email with subject line, greeting, body copy, offer, and call to action.",
    "video_script":        "Create a short video script with scene descriptions, narration text, and a call to action.",
    "product_description": "Create an e-commerce product description with headline, feature bullets, benefits, and call to action.",
    "social_caption":      "Create a short engaging social media caption with relevant hashtags.",
    "image":               "Create visual marketing content with a strong short caption and very detailed image generation prompt.",
    "merchandise":         "Create merchandise marketing copy with product concept name, tagline, design description, and target audience.",
    "marketing":           "Create professional marketing content with a headline, caption, offer, and call to action.",
}

def generate_marketing_content(input_type, input_value, business, content_type):

    if input_type == "website":
        context = crawl_website(input_value)
    elif input_type == "image":
        context = (
            f"User uploaded a product image stored in S3 at {input_value}. "
            f"Create marketing content based on the business context."
        )
    else:
        context = input_value

    instruction = CONTENT_TYPE_INSTRUCTIONS.get(
        content_type,
        "Create professional marketing content with a headline, caption, offer, and call to action."
    )

    prompt = f"""
You are a marketing expert.

Business: {business}
Content Type: {content_type}
Context: {context}

{instruction}

Return ONLY valid JSON with no markdown or explanation:

{{
  "caption": "Main content text",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "image_prompt": "Detailed visual prompt for image generation"
}}
"""

    response = bedrock_text.converse(
        modelId="amazon.nova-lite-v1:0",
        messages=[
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ],
        inferenceConfig={
            "maxTokens": 1000,
            "temperature": 0.7
        }
    )

    text = response["output"]["message"]["content"][0]["text"]

    # Strip markdown code fences if present
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    try:
        return json.loads(text.strip())
    except Exception:
        return {
            "caption":      f"Marketing content for {business}",
            "hashtags":     ["#marketing", "#business"],
            "image_prompt": (
                f"Professional marketing image for {business}, "
                f"modern branding, advertising photography, studio lighting"
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
        body=json.dumps({
            "prompt":        image_prompt,
            "mode":          "text-to-image",
            "aspect_ratio":  "1:1",
            "output_format": "png"
        }),
        contentType="application/json",
        accept="application/json"
    )

    result = json.loads(response["body"].read())
    return base64.b64decode(result["images"][0])


# ============================================================
# Website Crawl
# ============================================================

def crawl_website(url):

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode("utf-8", errors="ignore")
        return html[:5000]
    except Exception as e:
        print(str(e))
        return f"Website URL: {url}"


# ============================================================
# API Response
# ============================================================

def api_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Content-Type":                 "application/json"
        },
        "body": json.dumps(body, default=str)
    }
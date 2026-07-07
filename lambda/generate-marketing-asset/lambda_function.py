import json
import re
import uuid
import os
import boto3
import base64
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from auth import get_user
from response import api_response
from authorization import require_role

# AWS Clients (module-level - reused across warm invocations, already correct)
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

        user = get_user(event)
        print(f"Genarate_caption: User ID: {user}")
        user_id = user['user_id']

        input_type    = body.get("input_type", "text")
        input_value   = body.get("input_value", "")
        business      = body.get("business", "My Business")
        content_type  = body.get("content_type", "marketing")
        output_format = body.get("output_format", "plain_text")
        image_model_id = body.get("modelId", DEFAULT_IMAGE_MODEL)

        # Capture the original user-typed prompt BEFORE input_value
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
        # (Nova Lite call — this is on the critical path, since
        # image_prompt below depends on its output)
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
        # (Stability call — genuinely sequential after Nova Lite,
        # since it needs image_prompt)
        # ---------------------------------------------------

        image_bytes = generate_image(image_prompt, image_model_id)

        image_key = f"generated/{user_id}/{action_id}.png"
        created_at = datetime.utcnow().isoformat()

        # ---------------------------------------------------
        # S3 UPLOAD + DYNAMODB WRITE — run concurrently.
        # Neither depends on the other's result: the DynamoDB
        # item only needs image_key (already known), not the
        # upload's return value.
        # ---------------------------------------------------

        def upload_image():
            s3.put_object(
                Bucket=BUCKET,
                Key=image_key,
                Body=image_bytes,
                ContentType="image/png"
            )

        def write_record():
            table.put_item(
                Item={
                    "action_id":     action_id,
                    "user_id":       user_id,
                    "business":      business,
                    "content_type":  content_type,
                    "output_format": output_format,
                    "input_type":    input_type,
                    "input_value":   input_value,
                    "prompt":        original_prompt,
                    "caption":       marketing_data["caption"],
                    "hashtags":      marketing_data["hashtags"],
                    "image_prompt":  image_prompt,
                    "image_key":     image_key,
                    "image_model":   image_model_id,
                    "status":        "draft",
                    "created_at":    created_at
                }
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            upload_future = executor.submit(upload_image)
            write_future = executor.submit(write_record)
            # surface exceptions from either thread
            upload_future.result()
            write_future.result()

        # presigned URL generation is a local signing operation
        # (no network round trip), so it doesn't need parallelizing —
        # it just needs to run after the upload completes
        image_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": image_key},
            ExpiresIn=86400
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
                "content_type": content_type,
                "prompt":       original_prompt,
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
# CHANGED: previously returned the first 5000 chars of raw HTML,
# which meant most of the Nova Lite prompt budget was spent on
# <script>, <style>, nav/footer markup, and tag noise instead of
# actual page content. This strips scripts/styles and tags first,
# so the same character budget carries far more real signal —
# faster Nova Lite call, and better context for the caption/flyer copy.

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")

def crawl_website(url):

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode("utf-8", errors="ignore")

        text = _SCRIPT_STYLE_RE.sub(" ", html)
        text = _TAG_RE.sub(" ", text)
        text = _WHITESPACE_RE.sub(" ", text).strip()

        return text[:5000] if text else f"Website URL: {url}"
    except Exception as e:
        print(str(e))
        return f"Website URL: {url}"
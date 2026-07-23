import json
import uuid
import os
import boto3
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from auth import get_user
from response import api_response
from authorization import require_role

# AWS Clients
dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table(os.environ["DYNAMO_TABLE"])

s3 = boto3.client("s3", region_name="us-east-2")
BUCKET = os.environ["S3_BUCKET"]

bedrock_text = boto3.client("bedrock-runtime", region_name="us-east-1")
bedrock_image = boto3.client("bedrock-runtime", region_name="us-west-2")

DEFAULT_IMAGE_MODEL = "stability.stable-image-ultra-v1:1"


def get_image_format(image_bytes):
    """Detect image format from magic bytes."""
    if image_bytes[:3] == b'\xff\xd8\xff':
        return "jpeg"
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return "png"
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return "webp"
    if image_bytes[:6] in (b'GIF87a', b'GIF89a'):
        return "gif"
    return "png"


# def extract_user_id(event):
#     """Extract user ID from multiple possible locations in the event."""
#     if event.get("source") == "lambda-internal":
#         return "system"

#     try:
#         claims = (
#             event.get("requestContext", {})
#                  .get("authorizer", {})
#                  .get("jwt", {})
#                  .get("claims", {})
#         )
#         if claims.get("sub"):
#             print(f"Got user_id from jwt claims: {claims['sub']}")
#             return claims["sub"]
#     except Exception as e:
#         print(f"jwt claims method failed: {str(e)}")

#     try:
#         claims = (
#             event.get("requestContext", {})
#                  .get("authorizer", {})
#                  .get("claims", {})
#         )
#         if claims.get("sub"):
#             print(f"Got user_id from authorizer claims: {claims['sub']}")
#             return claims["sub"]
#     except Exception as e:
#         print(f"authorizer claims method failed: {str(e)}")

#     try:
#         auth_header = (
#             event.get("headers", {}).get("Authorization") or
#             event.get("headers", {}).get("authorization") or ""
#         )
#         if auth_header.startswith("Bearer "):
#             token_parts = auth_header.split(".")[1]
#             padding = 4 - len(token_parts) % 4
#             token_parts += "=" * padding
#             claims = json.loads(base64.b64decode(token_parts))
#             sub = claims.get("sub")
#             if sub:
#                 print(f"Got user_id from JWT header: {sub}")
#                 return sub
#     except Exception as e:
#         print(f"JWT header method failed: {str(e)}")

#     print("WARNING: Could not extract user_id, using unknown")
#     return "unknown"


def lambda_handler(event, context):
    try:
        print(json.dumps(event, default=str))
        body = json.loads(event.get("body", "{}"))
        action_id = str(uuid.uuid4())

        print(f"DEBUG body keys: {list(body.keys())}")

        user = get_user(event)
        print(f"Genarate-marketing-asset: User ID: {user}")
        user_id = user['user_id']
        print(f"Resolved user_id: {user_id}")

        input_type      = body.get("input_type", "text")
        input_value     = body.get("input_value", body.get("prompt", ""))
        business        = body.get("business", "My Business") # TODO: need to get bussiness id from UI
        content_type    = body.get("content_type", body.get("contentType", "marketing")) # TODO: need to get from UI
        output_format   = body.get("output_format", "plain_text")
        original_prompt = body.get("prompt", input_value)

        # Always use default image model — never use text model for image generation
        image_model_id = DEFAULT_IMAGE_MODEL

        # Accept both image_base64 (frontend) and image_data (legacy)
        image_base64 = body.get("image_base64") or body.get("image_data")
        print(f"DEBUG image_base64 present: {bool(image_base64)}, length: {len(image_base64) if image_base64 else 0}")

        # If image uploaded, detect format and save to S3 uploads/ folder
        if image_base64:
            try:
                image_bytes_upload = base64.b64decode(image_base64)
                image_format = get_image_format(image_bytes_upload)
                file_ext = "jpg" if image_format == "jpeg" else image_format
                content_type_header = f"image/{image_format}"
                uploaded_image_key = f"uploads/{action_id}.{file_ext}"
                s3.put_object(
                    Bucket=BUCKET,
                    Key=uploaded_image_key,
                    Body=image_bytes_upload,
                    ContentType=content_type_header
                )
                print(f"Successfully uploaded image to S3: {uploaded_image_key} (format: {image_format})")
                input_type  = "image"
                input_value = uploaded_image_key
            except Exception as e:
                print(f"Failed to upload image to S3: {str(e)}")

        # Generate marketing content
        marketing_data = generate_marketing_content(
            input_type=input_type,
            input_value=input_value,
            business=business,
            content_type=content_type,
        )

        image_prompt = marketing_data["image_prompt"]
        image_bytes  = generate_image(image_prompt, image_model_id)

        image_key  = f"generated/{user_id}/{action_id}.png"
        created_at = datetime.utcnow().isoformat()

        def upload_image():
            s3.put_object(
                Bucket=BUCKET,
                Key=image_key,
                Body=image_bytes,
                ContentType="image/png"
            )
            print(f"Successfully uploaded generated image: {image_key}")

        def write_record():
            table.put_item(Item={
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
                "created_at":    created_at,
            })
            print(f"Successfully wrote record to DynamoDB: {action_id}")

        with ThreadPoolExecutor(max_workers=2) as executor:
            executor.submit(upload_image).result()
            executor.submit(write_record).result()

        image_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": image_key},
            ExpiresIn=86400
        )

        return api_response(200, {
                "action_id":    action_id,
                "caption":      marketing_data["caption"],
                "hashtags":     marketing_data["hashtags"],
                "image_prompt": image_prompt,
                "image_url":    image_url,
                "image_model":  image_model_id,
                "content_type": content_type,
                "prompt":       original_prompt,
                "status":       "draft",
                "created_at":   created_at,
            })

    except Exception as e:
        print(f"FATAL ERROR: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }


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

    instruction = CONTENT_TYPE_INSTRUCTIONS.get(
        content_type,
        "Create professional marketing content with a headline, caption, offer, and call to action."
    )

    json_schema = (
        '{\n'
        '  "caption": "Main content text",\n'
        '  "hashtags": ["#tag1", "#tag2", "#tag3"],\n'
        '  "image_prompt": "Detailed visual prompt for image generation"\n'
        '}'
    )

    if input_type == "image" and input_value:
        try:
            s3_response = s3.get_object(Bucket=BUCKET, Key=input_value)
            image_bytes = s3_response["Body"].read()
            image_format = get_image_format(image_bytes)
            print(f"Read image from S3: {input_value}, size: {len(image_bytes)} bytes, format: {image_format}")
        except Exception as e:
            print(f"Failed to read image from S3: {str(e)}")
            image_bytes = None
            image_format = "png"

        if image_bytes:
            prompt_text = (
                f"You are an expert marketing analyst and copywriter.\n\n"
                f"Business: {business}\n"
                f"Content Type: {content_type}\n\n"
                f"Carefully analyze this product image and extract the following details:\n"
                f"1. PACKAGING: Shape, material, size, and design of the packaging\n"
                f"2. COLOR THEME: Primary and secondary colors used\n"
                f"3. TEXT/BRANDING: Any visible text, brand names, slogans, or logos on the packaging\n"
                f"4. PRODUCT TYPE: What the product appears to be\n"
                f"5. MOOD/STYLE: The overall feel — luxury, natural, playful, professional, etc.\n\n"
                f"Use ALL of these extracted details to create marketing content that stays "
                f"true to the product's visual identity and brand language.\n\n"
                f"{instruction}\n\n"
                f"For the image_prompt field, describe a marketing scene that:\n"
                f"- Features the EXACT same product with its original packaging, colors, and text\n"
                f"- Places it in an aspirational setting that matches the product's mood\n"
                f"- Preserves all branding elements visible in the original image\n"
                f"- No additional text overlays, no watermarks\n\n"
                f"Return ONLY valid JSON:\n{json_schema}"
            )
            content = [
                {
                    "image": {
                        "format": image_format,
                        "source": {"bytes": image_bytes}
                    }
                },
                {"text": prompt_text}
            ]
        else:
            content = [{"text": (
                f"You are a marketing expert.\n\nBusiness: {business}\n"
                f"Content Type: {content_type}\n\n{instruction}\n\n"
                f"Return ONLY valid JSON:\n{json_schema}"
            )}]
    else:
        prompt_text = (
            f"You are a marketing expert.\n\n"
            f"Business: {business}\n"
            f"Content Type: {content_type}\n"
            f"Context: {input_value}\n\n"
            f"{instruction}\n\n"
            f"Return ONLY valid JSON:\n{json_schema}"
        )
        content = [{"text": prompt_text}]

    response = bedrock_text.converse(
        modelId="us.amazon.nova-pro-v1:0",
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"maxTokens": 1500, "temperature": 0.7}
    )

    text = response["output"]["message"]["content"][0]["text"]

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
            "image_prompt": f"Professional marketing image for {business}, modern branding, advertising photography"
        }


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
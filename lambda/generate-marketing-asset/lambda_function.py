import json
import uuid
import os
import boto3
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from auth import get_user
from response import api_response

# AWS Clients
dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table          = dynamodb.Table(os.environ["DYNAMO_TABLE"])
artifact_table = dynamodb.Table("Artifact")
audit_table    = dynamodb.Table("AuditEvent")
job_table      = dynamodb.Table("Job")

s3 = boto3.client("s3", region_name="us-east-2")
BUCKET = os.environ.get("S3_BUCKET", "kushtest-marketing-ai-assets")

bedrock_text  = boto3.client("bedrock-runtime", region_name="us-east-1")
bedrock_image = boto3.client("bedrock-runtime", region_name="us-west-2")

DEFAULT_IMAGE_MODEL = "stability.stable-image-ultra-v1:1"


def get_image_format(image_bytes):
    if image_bytes[:3] == b'\xff\xd8\xff':
        return "jpeg"
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return "png"
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return "webp"
    if image_bytes[:6] in (b'GIF87a', b'GIF89a'):
        return "gif"
    return "png"


def build_job_prefix(business_id, user_id, content_type, action_id, now):
    date_path = now.strftime("%Y/%m/%d")
    return f"businesses/{business_id}/userid/{user_id}/content/{date_path}/{content_type}/{action_id}"


def write_artifact(action_id, artifact_type, s3_key, size_bytes=0, width=None, height=None):
    try:
        artifact_id = "ART-" + str(uuid.uuid4())[:8].upper()
        item = {
            "action_id":    action_id,
            "artifactId":   artifact_id,
            "artifactType": artifact_type,
            "s3Key":        s3_key,
            "sizeBytes":    size_bytes,
            "version":      1,
            "created_at":   datetime.utcnow().isoformat(),
        }
        if width:
            item["width"] = width
        if height:
            item["height"] = height
        artifact_table.put_item(Item=item)
        print(f"Wrote artifact: {artifact_id} type={artifact_type} key={s3_key}")
    except Exception as e:
        print(f"Failed to write artifact: {str(e)}")


def write_job(action_id, business_id, user_id, user_email, content_type, model_id,
              input_prompt, input_param, requested_at, now, s3_prefix, source_job_id="none"):
    try:
        duration_ms = int((datetime.utcnow() - now).total_seconds() * 1000)
        job_table.put_item(Item={
            "action_id":     action_id,
            "businessId":    business_id,
            "userId":        user_id,
            "useremail":     user_email,
            "channel":       "web",
            "contentType":   content_type,
            "modelId":       model_id,
            "inputprompt":   input_prompt,
            "inputparam":    input_param,
            "requestedAt":   requested_at,
            "durationMs":    str(duration_ms),
            "estimatedCost": "0.00",
            "totalToken":    "0",
            "accuracyScore": "0.00",
            "s3prefix":      s3_prefix,
            "sourcejobId":   source_job_id,
            "status":        "success",
            "createdAt":     datetime.utcnow().isoformat(),
        })
        print(f"Wrote job record: {action_id}")
    except Exception as e:
        print(f"Failed to write job record: {str(e)}")


def write_audit_event(action, user_id, entity_id, result="SUCCESS", metadata=None):
    try:
        event_id = "EVT-" + str(uuid.uuid4())[:8].upper()
        item = {
            "eventId":   event_id,
            "action":    action,
            "userId":    user_id,
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


def extract_text_from_image(image_bytes, image_format):
    try:
        response = bedrock_text.converse(
            modelId="us.amazon.nova-pro-v1:0",
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": image_format, "source": {"bytes": image_bytes}}},
                    {"text": (
                        "Read this image very carefully. Extract and list EVERY piece of text "
                        "visible on the product exactly as written — including brand names, "
                        "product names, slogans, ingredients, weights, measurements, taglines, "
                        "and any other text. Spell each word exactly as it appears. "
                        "Return ONLY a JSON object:\n"
                        '{"texts": ["exact text 1", "exact text 2", "exact text 3"]}'
                    )}
                ]
            }],
            inferenceConfig={"maxTokens": 500, "temperature": 0}
        )
        raw = response["output"]["message"]["content"][0]["text"].strip()
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0]
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0]
        result = json.loads(raw.strip())
        texts = result.get("texts", [])
        print(f"Extracted texts from image: {texts}")
        return texts
    except Exception as e:
        print(f"Text extraction failed: {str(e)}")
        return []


def lambda_handler(event, context):
    try:
        print(json.dumps(event, default=str))
        body = json.loads(event.get("body", "{}"))

        action_id    = str(uuid.uuid4())
        now          = datetime.utcnow()
        requested_at = now.isoformat()

        print(f"DEBUG body keys: {list(body.keys())}")

        user = get_user(event)
        print(f"Generate-marketing-asset: User ID: {user}")
        user_id     = user['user_id']
        user_email  = user.get('email', '')
        business_id = body.get("businessId", user_id)
        print(f"Resolved user_id: {user_id}, business_id: {business_id}, action_id: {action_id}")

        input_type      = body.get("input_type", "text")
        input_value     = body.get("input_value", body.get("prompt", ""))
        business        = body.get("business", "My Business")
        content_type    = body.get("content_type", body.get("contentType", "marketing"))
        output_format   = body.get("output_format", "plain_text")
        original_prompt = body.get("prompt", input_value)
        image_model_id  = DEFAULT_IMAGE_MODEL

        job_prefix = build_job_prefix(business_id, user_id, content_type, action_id, now)
        print(f"Job prefix: {job_prefix}")

        image_base64 = body.get("image_base64") or body.get("image_data")
        print(f"DEBUG image_base64 present: {bool(image_base64)}, length: {len(image_base64) if image_base64 else 0}")

        uploaded_image_key = None

        if image_base64:
            try:
                image_bytes_upload = base64.b64decode(image_base64)
                image_format = get_image_format(image_bytes_upload)
                file_ext = "jpg" if image_format == "jpeg" else image_format
                uploaded_image_key = f"{job_prefix}/uploads/graphics/uploaded-image.{file_ext}"
                s3.put_object(
                    Bucket=BUCKET,
                    Key=uploaded_image_key,
                    Body=image_bytes_upload,
                    ContentType=f"image/{image_format}"
                )
                print(f"Successfully uploaded image to S3: {uploaded_image_key}")
                input_type  = "image"
                input_value = uploaded_image_key
                write_artifact(
                    action_id=action_id,
                    artifact_type="uploaded_image",
                    s3_key=uploaded_image_key,
                    size_bytes=len(image_bytes_upload)
                )
            except Exception as e:
                print(f"Failed to upload image to S3: {str(e)}")

        request_data = {
            "action_id":     action_id,
            "business_id":   business_id,
            "user_id":       user_id,
            "business":      business,
            "content_type":  content_type,
            "output_format": output_format,
            "input_type":    input_type,
            "prompt":        original_prompt,
            "platforms":     body.get("platforms", []),
            "created_at":    now.isoformat(),
        }
        s3.put_object(
            Bucket=BUCKET,
            Key=f"{job_prefix}/input/request.json",
            Body=json.dumps(request_data, indent=2),
            ContentType="application/json"
        )
        s3.put_object(
            Bucket=BUCKET,
            Key=f"{job_prefix}/input/prompt.txt",
            Body=original_prompt,
            ContentType="text/plain"
        )

        marketing_data = generate_marketing_content(
            input_type=input_type,
            input_value=input_value,
            business=business,
            content_type=content_type,
        )

        image_prompt = marketing_data["image_prompt"]
        image_bytes  = generate_image(
            image_prompt=image_prompt,
            model_id=image_model_id,
            reference_image_key=uploaded_image_key
        )

        created_at   = now.isoformat()
        graphic_key  = f"{job_prefix}/graphics/image-001.png"
        metadata_key = f"{job_prefix}/metadata/job-metadata.json"

        job_metadata = {
            "action_id":     action_id,
            "user_id":       user_id,
            "business_id":   business_id,
            "business":      business,
            "content_type":  content_type,
            "output_format": output_format,
            "input_type":    input_type,
            "input_value":   input_value,
            "prompt":        original_prompt,
            "caption":       marketing_data["caption"],
            "hashtags":      marketing_data["hashtags"],
            "image_prompt":  image_prompt,
            "image_model":   image_model_id,
            "graphic_key":   graphic_key,
            "s3_prefix":     job_prefix,
            "status":        "completed",
            "created_at":    created_at,
        }

        def upload_graphic():
            s3.put_object(Bucket=BUCKET, Key=graphic_key, Body=image_bytes, ContentType="image/png")
            print(f"Successfully uploaded graphic: {graphic_key}")
            write_artifact(
                action_id=action_id,
                artifact_type="image",
                s3_key=graphic_key,
                size_bytes=len(image_bytes),
                width=1080,
                height=1080
            )

        def upload_metadata():
            s3.put_object(
                Bucket=BUCKET,
                Key=metadata_key,
                Body=json.dumps(job_metadata, indent=2),
                ContentType="application/json"
            )
            print(f"Successfully uploaded metadata: {metadata_key}")

        def write_record():
            table.put_item(Item={
                "action_id":     action_id,
                "user_id":       user_id,
                "business":      business,
                "business_id":   business_id,
                "content_type":  content_type,
                "output_format": output_format,
                "input_type":    input_type,
                "input_value":   input_value,
                "prompt":        original_prompt,
                "caption":       marketing_data["caption"],
                "hashtags":      marketing_data["hashtags"],
                "image_prompt":  image_prompt,
                "image_key":     graphic_key,
                "s3_prefix":     job_prefix,
                "image_model":   image_model_id,
                "status":        "draft",
                "created_at":    created_at,
            })
            print(f"Successfully wrote record to DynamoDB: {action_id}")

        with ThreadPoolExecutor(max_workers=3) as executor:
            executor.submit(upload_graphic).result()
            executor.submit(upload_metadata).result()
            executor.submit(write_record).result()

        write_job(
            action_id=action_id,
            business_id=business_id,
            user_id=user_id,
            user_email=user_email,
            content_type=content_type,
            model_id=image_model_id,
            input_prompt=original_prompt,
            input_param=output_format,
            requested_at=requested_at,
            now=now,
            s3_prefix=job_prefix,
            source_job_id=body.get("sourceJobId", "none"),
        )

        write_audit_event(
            action="CREATE_JOB",
            user_id=user_id,
            entity_id=action_id,
            result="SUCCESS",
            metadata={
                "business_id":  business_id,
                "content_type": content_type,
                "s3_prefix":    job_prefix,
            }
        )

        image_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": graphic_key},
            ExpiresIn=86400
        )

        return api_response(200, {
            "action_id":    action_id,
            "caption":      marketing_data["caption"],
            "hashtags":     marketing_data["hashtags"],
            "image_prompt": image_prompt,
            "image_url":    image_url,
            "s3_prefix":    job_prefix,
            "image_model":  image_model_id,
            "content_type": content_type,
            "prompt":       original_prompt,
            "status":       "draft",
            "created_at":   created_at,
        })

    except Exception as e:
        try:
            write_audit_event(
                action="CREATE_JOB",
                user_id=user_id if 'user_id' in locals() else "unknown",
                entity_id=action_id if 'action_id' in locals() else "unknown",
                result="FAIL",
                metadata={"error": str(e)}
            )
        except Exception:
            pass
        print(f"FATAL ERROR: {str(e)}")
        return api_response(500, {"error": str(e)})


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
            extracted_texts = extract_text_from_image(image_bytes, image_format)
            texts_str = ", ".join([f'"{t}"' for t in extracted_texts]) if extracted_texts else "none detected"
            prompt_text = (
                f"You are an expert marketing analyst and copywriter.\n\n"
                f"Business: {business}\n"
                f"Content Type: {content_type}\n\n"
                f"IMPORTANT — The following text was extracted directly from the product image. "
                f"Use these EXACT spellings in all content you generate. Do not alter, guess, "
                f"or correct any of these:\n"
                f"Extracted texts: {texts_str}\n\n"
                f"Now analyze the full image and extract:\n"
                f"1. PACKAGING: Exact shape, material, size, and design\n"
                f"2. COLOR THEME: Exact primary and secondary colors\n"
                f"3. TEXT/BRANDING: Use ONLY the extracted texts above — exact spellings\n"
                f"4. PRODUCT TYPE: What the product is\n"
                f"5. MOOD/STYLE: Luxury, natural, playful, professional, etc.\n\n"
                f"{instruction}\n\n"
                f"For the image_prompt field:\n"
                f"- Reproduce the EXACT same product with 100% fidelity\n"
                f"- Include ALL text exactly as extracted: {texts_str}\n"
                f"- Maintain original packaging shape, colors, textures, and proportions\n"
                f"- Maintain exact size and scale of the product\n"
                f"- Professional studio photography, improved lighting and composition only\n"
                f"- Do not alter, reinterpret, simplify, or restyle the product in any way\n\n"
                f"Return ONLY valid JSON:\n{json_schema}"
            )
            content = [
                {"image": {"format": image_format, "source": {"bytes": image_bytes}}},
                {"text": prompt_text}
            ]
        else:
            content = [{"text": (
                f"You are a marketing expert.\n\nBusiness: {business}\n"
                f"Content Type: {content_type}\n\n{instruction}\n\n"
                f"Return ONLY valid JSON:\n{json_schema}"
            )}]
    else:
        content = [{"text": (
            f"You are a marketing expert.\n\n"
            f"Business: {business}\n"
            f"Content Type: {content_type}\n"
            f"Context: {input_value}\n\n"
            f"{instruction}\n\n"
            f"Return ONLY valid JSON:\n{json_schema}"
        )}]

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


def generate_image(image_prompt, model_id=None, reference_image_key=None):
    if model_id is None:
        model_id = DEFAULT_IMAGE_MODEL

    if reference_image_key:
        try:
            s3_response = s3.get_object(Bucket=BUCKET, Key=reference_image_key)
            reference_bytes = s3_response["Body"].read()
            reference_b64 = base64.b64encode(reference_bytes).decode("utf-8")
            print(f"Using image-to-image mode with reference: {reference_image_key}")
            response = bedrock_image.invoke_model(
                modelId=model_id,
                body=json.dumps({
                    "prompt": (
                        f"{image_prompt}. "
                        f"Reproduce the exact same product with 100% fidelity. "
                        f"Maintain all original packaging: exact shape, exact colors, exact textures, "
                        f"exact label text with correct spelling, exact logos, exact typography, "
                        f"exact proportions and size. "
                        f"Professional studio photography with improved lighting and composition only. "
                        f"Do not alter, reinterpret, simplify, or restyle the product in any way."
                    ),
                    "negative_prompt": (
                        "different product, altered text, wrong spelling, misspelled words, "
                        "changed colors, modified packaging, simplified design, different shape, "
                        "reinterpreted branding, cartoon, illustration, abstract, "
                        "different size, scaled differently, distorted proportions"
                    ),
                    "mode":          "image-to-image",
                    "image":         reference_b64,
                    "strength":      0.2,
                    "output_format": "png"
                }),
                contentType="application/json",
                accept="application/json"
            )
            result = json.loads(response["body"].read())
            print("Successfully generated image-to-image output")
            return base64.b64decode(result["images"][0])
        except Exception as e:
            print(f"Image-to-image failed, falling back to text-to-image: {str(e)}")

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

import json
import uuid
import os
import io
import boto3
import base64
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from auth import get_user
from response import api_response

# AWS Clients
dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table          = dynamodb.Table(os.environ["DYNAMO_TABLE"])
artifact_table = dynamodb.Table("Artifact")
audit_table    = dynamodb.Table("AuditEvent")
job_table      = dynamodb.Table("Job")

s3 = boto3.client("s3", region_name="us-east-2")
BUCKET = os.environ["S3_BUCKET"]

bedrock_text  = boto3.client("bedrock-runtime", region_name="us-east-1")
bedrock_image = boto3.client("bedrock-runtime", region_name="us-west-2")


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


def lambda_handler(event, context):
    try:
        body = json.loads(event["body"])

        user = get_user(event)
        print(f"Generate_caption: User ID: {user}")
        user_id     = user['user_id']
        user_email  = user.get('email', '')
        business_id = body.get("businessId", user_id)

        action_id     = str(uuid.uuid4())
        now           = datetime.utcnow()
        requested_at  = now.isoformat()
        business      = body.get("business", "My Business")
        prompt        = body.get("prompt", "")
        platforms     = body.get("platforms", [])
        content_type  = body.get("content_type", body.get("contentType", "flyer"))
        output_format = body.get("output_format", "plain_text")

        TEXT_MODEL  = os.environ.get("TEXT_MODEL",  "us.amazon.nova-micro-v1:0")
        IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "stability.sd3-5-large-v1:0")

        job_prefix = build_job_prefix(business_id, user_id, content_type, action_id, now)
        print(f"Job prefix: {job_prefix}")

        flyer       = generate_flyer_content(business, prompt, platforms)
        bg_bytes    = generate_flyer_image(flyer["image_prompt"])
        image_bytes = composite_flyer(bg_bytes, business, flyer["title"], flyer["offer"], flyer["call_to_action"])

        created_at   = now.isoformat()
        graphic_key  = f"{job_prefix}/graphics/image-001.png"
        metadata_key = f"{job_prefix}/metadata/job-metadata.json"

        # Save request.json
        request_data = {
            "action_id":     action_id,
            "business_id":   business_id,
            "user_id":       user_id,
            "business":      business,
            "content_type":  content_type,
            "output_format": output_format,
            "prompt":        prompt,
            "platforms":     platforms,
            "created_at":    created_at,
        }
        s3.put_object(
            Bucket=BUCKET,
            Key=f"{job_prefix}/input/request.json",
            Body=json.dumps(request_data, indent=2),
            ContentType="application/json"
        )

        # Save prompt.txt
        s3.put_object(
            Bucket=BUCKET,
            Key=f"{job_prefix}/input/prompt.txt",
            Body=prompt,
            ContentType="text/plain"
        )

        # Upload generated image
        s3.put_object(Bucket=BUCKET, Key=graphic_key, Body=image_bytes, ContentType="image/png")
        print(f"Uploaded graphic: {graphic_key}")

        # Write artifact for generated image
        write_artifact(
            action_id=action_id,
            artifact_type="image",
            s3_key=graphic_key,
            size_bytes=len(image_bytes),
            width=1080,
            height=1080
        )

        image_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": graphic_key},
            ExpiresIn=86400
        )

        # Save job metadata
        job_metadata = {
            "action_id":      action_id,
            "user_id":        user_id,
            "business_id":    business_id,
            "business":       business,
            "content_type":   content_type,
            "output_format":  output_format,
            "prompt":         prompt,
            "platforms":      platforms,
            "title":          flyer["title"],
            "caption":        flyer["caption"],
            "offer":          flyer["offer"],
            "call_to_action": flyer["call_to_action"],
            "image_prompt":   flyer["image_prompt"],
            "text_model":     TEXT_MODEL,
            "image_model":    IMAGE_MODEL,
            "graphic_key":    graphic_key,
            "s3_prefix":      job_prefix,
            "status":         "generated",
            "created_at":     created_at,
        }
        s3.put_object(
            Bucket=BUCKET,
            Key=metadata_key,
            Body=json.dumps(job_metadata, indent=2),
            ContentType="application/json"
        )

        # Write DynamoDB record
        table.put_item(Item={
            "action_id":      action_id,
            "user_id":        user_id,
            "business":       business,
            "business_id":    business_id,
            "prompt":         prompt,
            "platforms":      platforms,
            "content_type":   content_type,
            "output_format":  output_format,
            "text_model":     TEXT_MODEL,
            "image_model":    IMAGE_MODEL,
            "title":          flyer["title"],
            "caption":        flyer["caption"],
            "offer":          flyer["offer"],
            "call_to_action": flyer["call_to_action"],
            "image_prompt":   flyer["image_prompt"],
            "image_url":      image_url,
            "image_key":      graphic_key,
            "s3_prefix":      job_prefix,
            "s3_key":         graphic_key,
            "status":         "generated",
            "created_at":     created_at,
        })
        print(f"Wrote DynamoDB record: {action_id}")

        write_job(
            action_id=action_id,
            business_id=business_id,
            user_id=user_id,
            user_email=user_email,
            content_type=content_type,
            model_id=IMAGE_MODEL,
            input_prompt=prompt,
            input_param=output_format,
            requested_at=requested_at,
            now=now,
            s3_prefix=job_prefix,
            source_job_id=body.get("sourceJobId", "none"),
        )

        # Write audit event
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

        return api_response(200, {
            "action_id":      action_id,
            "title":          flyer["title"],
            "caption":        flyer["caption"],
            "offer":          flyer["offer"],
            "call_to_action": flyer["call_to_action"],
            "image_url":      image_url,
            "s3_prefix":      job_prefix,
            "created_at":     created_at,
        })

    except Exception as e:
        print("ERROR:", str(e))
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
        return api_response(500, {"error": str(e)})


def get_font(size):
    """Load DejaVu font if available, else fall back to PIL default."""
    font_path = "/var/task/fonts/DejaVuSans-Bold.ttf"
    try:
        return ImageFont.truetype(font_path, size)
    except Exception:
        return ImageFont.load_default()


def draw_text_wrapped(draw, text, x, y, max_width, font, fill, line_spacing=8):
    """Draw text wrapped to max_width, centered at x."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = (current + " " + word).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        draw.text((x - lw // 2, y), line, font=font, fill=fill)
        y += (bbox[3] - bbox[1]) + line_spacing
    return y


def composite_flyer(bg_bytes, business, title, offer, cta):
    """Overlay text onto background image and return PNG bytes."""
    img = Image.open(io.BytesIO(bg_bytes)).convert("RGBA").resize((1080, 1080))
    draw = ImageDraw.Draw(img)
    cx = 540  # horizontal center

    # Top banner
    draw.rectangle([(0, 0), (1080, 120)], fill=(30, 30, 30, 210))
    font_biz = get_font(52)
    bbox = draw.textbbox((0, 0), business, font=font_biz)
    draw.text((cx - (bbox[2] - bbox[0]) // 2, 30), business, font=font_biz, fill=(255, 255, 255))

    # Headline with drop shadow
    font_title = get_font(58)
    draw.text((cx - 1, 300), title, font=font_title, fill=(0, 0, 0, 180))
    draw_text_wrapped(draw, title, cx, 298, 960, font_title, (255, 255, 255))

    # Offer box
    font_offer = get_font(42)
    offer_bbox = draw.textbbox((0, 0), offer, font=font_offer)
    ow = offer_bbox[2] - offer_bbox[0] + 40
    draw.rectangle([(cx - ow // 2, 620), (cx + ow // 2, 690)], fill=(255, 140, 0, 230))
    draw.text((cx - (offer_bbox[2] - offer_bbox[0]) // 2, 628), offer, font=font_offer, fill=(255, 255, 255))

    # Bottom banner
    draw.rectangle([(0, 960), (1080, 1080)], fill=(30, 30, 30, 210))
    font_cta = get_font(44)
    cta_bbox = draw.textbbox((0, 0), cta, font=font_cta)
    draw.text((cx - (cta_bbox[2] - cta_bbox[0]) // 2, 990), cta, font=font_cta, fill=(255, 220, 0))

    out = io.BytesIO()
    img.convert("RGB").save(out, format="PNG")
    return out.getvalue()


def generate_flyer_content(business, prompt, platforms):
    TEXT_MODEL = os.environ.get("TEXT_MODEL", "us.amazon.nova-micro-v1:0")
    platforms_str = ", ".join(platforms) if platforms else "social media"
    marketing_prompt = (
        f"You are an expert marketing copywriter. Create content for a marketing flyer based EXACTLY on the user's request.\n\n"
        f"Business: {business}\nTarget Platforms: {platforms_str}\n\n"
        f"User's Request:\n{prompt}\n\n"
        f"Return ONLY valid JSON:\n"
        f'{{\n'
        f'  "title": "Bold eye-catching headline",\n'
        f'  "caption": "Detailed marketing copy",\n'
        f'  "offer": "Special offer or value proposition (keep under 60 chars)",\n'
        f'  "call_to_action": "Short urgent CTA e.g. Call Now, Book Today",\n'
        f'  "image_prompt": "Background scene only (no text, no banners, no overlays) related to: {prompt}. '
        f'Vivid photorealistic scene, professional photography style, vibrant colors, high detail"\n'
        f'}}'
    )
    response = bedrock_text.converse(
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


def generate_flyer_image(image_prompt):
    IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "stability.sd3-5-large-v1:0")
    response = bedrock_image.invoke_model(
        modelId=IMAGE_MODEL,
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

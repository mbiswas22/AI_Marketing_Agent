import json
import uuid
import requests
import boto3
import os
import base64
from datetime import datetime
from bs4 import BeautifulSoup

bedrock       = boto3.client("bedrock-runtime", region_name="us-east-1")
bedrock_image = boto3.client("bedrock-runtime", region_name="us-west-2")
dynamodb      = boto3.resource("dynamodb", region_name="us-east-2")
s3            = boto3.client("s3", region_name="us-east-2")

table          = dynamodb.Table(os.environ.get("DYNAMO_TABLE", "kushtest-MarketingActions"))
artifact_table = dynamodb.Table("Artifact")
audit_table    = dynamodb.Table("AuditEvent")
job_table      = dynamodb.Table("Job")

S3_BUCKET  = os.environ.get("S3_BUCKET", "kushtest-marketing-ai-assets")
TEXT_MODEL = os.environ.get("TEXT_MODEL", "us.amazon.nova-micro-v1:0")


def get_user_id(event):
    try:
        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        if claims.get("sub"):
            return claims["sub"]
    except Exception:
        pass
    try:
        auth_header = (
            event.get("headers", {}).get("Authorization") or
            event.get("headers", {}).get("authorization") or ""
        )
        if auth_header.startswith("Bearer "):
            token_parts = auth_header.split(".")[1]
            padding = 4 - len(token_parts) % 4
            token_parts += "=" * padding
            claims = json.loads(base64.b64decode(token_parts))
            sub = claims.get("sub")
            if sub:
                return sub
    except Exception:
        pass
    return None


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
            "userId":        user_id or "unknown",
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


def extract_website_content(url):
    try:
        html = requests.get(url, timeout=10).text
        soup = BeautifulSoup(html, "html.parser")
        return {
            "title":      soup.title.string.strip() if soup.title else "",
            "h1":         [h.get_text(strip=True) for h in soup.find_all("h1")],
            "h2":         [h.get_text(strip=True) for h in soup.find_all("h2")],
            "paragraphs": [p.get_text(strip=True) for p in soup.find_all("p")]
        }
    except Exception as e:
        return {"error": f"Failed to crawl website: {str(e)}"}


def call_bedrock(prompt, max_tokens=100):
    response = bedrock.converse(
        modelId=TEXT_MODEL,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0.7}
    )
    return response["output"]["message"]["content"][0]["text"].strip()


def classify_business(info):
    text = " ".join(
        info.get("h1", []) + info.get("h2", []) + info.get("paragraphs", [])
    )[:3000]
    try:
        return call_bedrock(
            "You are a business classifier. Return ONLY the business type as a short noun phrase.\n\n"
            f"Website content:\n{text}",
            max_tokens=50
        )
    except Exception as e:
        return f"Business ({str(e)[:50]})"


def generate_marketing_content(marketing_prompt, content_type, platforms):
    try:
        platforms_str = ", ".join(platforms) if platforms else "social media"
        full_prompt = (
            f"You are an expert marketing copywriter.\n\n{marketing_prompt}\n\n"
            f"Create detailed, compelling {content_type} marketing content targeting {platforms_str}.\n"
            f"Write at least 3-4 paragraphs with a strong headline, body copy, and a clear call to action.\n\n"
            f"Return ONLY valid JSON:\n"
            f'{{"caption": "full marketing text here", "hashtags": ["#tag1", "#tag2"], "image_prompt": "detailed visual description, no text"}}'
        )
        text = call_bedrock(full_prompt, max_tokens=2000)
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)
    except Exception as e:
        print(f"generate_marketing_content error: {str(e)}")
        return {
            "caption":      "Check out our latest offerings!",
            "hashtags":     ["#marketing", "#business"],
            "image_prompt": "Professional marketing image, vibrant colors, commercial style"
        }


def generate_image(image_prompt):
    try:
        final_prompt = (
            f"{image_prompt}. Professional marketing photography, high quality, photorealistic, "
            f"vibrant colors, commercial advertising style, no text, no words, no watermarks."
        )
        response = bedrock_image.invoke_model(
            modelId="stability.stable-image-core-v1:1",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "prompt":        final_prompt,
                "aspect_ratio":  "1:1",
                "output_format": "png"
            })
        )
        result = json.loads(response["body"].read())
        return base64.b64decode(result["images"][0])
    except Exception as e:
        print(f"Image generation failed: {str(e)}")
        return None


def lambda_handler(event, context):
    action_id = None
    user_id   = None
    try:
        body         = json.loads(event.get("body") or "{}")
        url          = body.get("url")
        content_type = body.get("contentType", "flyer")
        platforms    = body.get("platforms", ["social"])

        if not url:
            return {
                "statusCode": 400,
                "headers":    {"Access-Control-Allow-Origin": "*"},
                "body":       json.dumps({"error": "URL is required"})
            }

        user_id     = get_user_id(event)
        user_email  = ""
        business_id = body.get("businessId", user_id or "anonymous")

        action_id  = str(uuid.uuid4())
        now        = datetime.utcnow()
        created_at = now.isoformat()
        requested_at = now.isoformat()

        job_prefix = build_job_prefix(
            business_id, user_id or "anonymous", content_type, action_id, now
        )
        print(f"Job prefix: {job_prefix}")

        website_info = extract_website_content(url)
        if "error" in website_info:
            return {
                "statusCode": 500,
                "headers":    {"Access-Control-Allow-Origin": "*"},
                "body":       json.dumps({"error": website_info["error"]})
            }

        business_type = classify_business(website_info)

        marketing_prompt = (
            f"Website: {website_info.get('title')}\n"
            f"Business Type: {business_type}\n"
            f"Key Headlines: {', '.join(website_info.get('h1', [])[:3])}\n"
            f"Key Content: {' '.join(website_info.get('paragraphs', [])[:5])[:1000]}"
        )

        # Save crawled content to S3
        crawl_key = f"{job_prefix}/input/crawled-content.json"
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=crawl_key,
            Body=json.dumps(website_info, indent=2),
            ContentType="application/json"
        )
        write_artifact(
            action_id=action_id,
            artifact_type="crawled_content",
            s3_key=crawl_key,
            size_bytes=len(json.dumps(website_info).encode())
        )

        s3.put_object(
            Bucket=S3_BUCKET,
            Key=f"{job_prefix}/input/prompt.txt",
            Body=marketing_prompt,
            ContentType="text/plain"
        )

        marketing_data = generate_marketing_content(marketing_prompt, content_type, platforms)

        image_bytes = generate_image(marketing_data["image_prompt"])

        graphic_key  = f"{job_prefix}/graphics/image-001.png"
        metadata_key = f"{job_prefix}/metadata/job-metadata.json"

        job_metadata = {
            "action_id":     action_id,
            "user_id":       user_id,
            "business_id":   business_id,
            "business_type": business_type,
            "url":           url,
            "content_type":  content_type,
            "platforms":     platforms,
            "caption":       marketing_data["caption"],
            "hashtags":      marketing_data["hashtags"],
            "image_prompt":  marketing_data["image_prompt"],
            "graphic_key":   graphic_key,
            "s3_prefix":     job_prefix,
            "status":        "completed",
            "created_at":    created_at,
        }

        if image_bytes:
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=graphic_key,
                Body=image_bytes,
                ContentType="image/png"
            )
            print(f"Uploaded graphic: {graphic_key}")
            write_artifact(
                action_id=action_id,
                artifact_type="image",
                s3_key=graphic_key,
                size_bytes=len(image_bytes),
                width=1080,
                height=1080
            )

        s3.put_object(
            Bucket=S3_BUCKET,
            Key=metadata_key,
            Body=json.dumps(job_metadata, indent=2),
            ContentType="application/json"
        )

        table.put_item(Item={
            "action_id":     action_id,
            "user_id":       user_id,
            "business_id":   business_id,
            "business":      business_type,
            "content_type":  content_type,
            "input_type":    "url",
            "input_value":   url,
            "prompt":        marketing_prompt,
            "caption":       marketing_data["caption"],
            "hashtags":      marketing_data["hashtags"],
            "image_prompt":  marketing_data["image_prompt"],
            "image_key":     graphic_key,
            "s3_prefix":     job_prefix,
            "status":        "draft",
            "created_at":    created_at,
        })
        print(f"Wrote DynamoDB record: {action_id}")

        write_job(
            action_id=action_id,
            business_id=business_id,
            user_id=user_id,
            user_email=user_email,
            content_type=content_type,
            model_id="stability.stable-image-core-v1:1",
            input_prompt=url,
            input_param=content_type,
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
                "url":          url,
                "s3_prefix":    job_prefix,
            }
        )

        image_url = None
        if image_bytes:
            image_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": graphic_key},
                ExpiresIn=86400
            )

        return {
            "statusCode": 200,
            "headers":    {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({
                "action_id":    action_id,
                "caption":      marketing_data["caption"],
                "hashtags":     marketing_data["hashtags"],
                "image_prompt": marketing_data["image_prompt"],
                "image_url":    image_url,
                "s3_prefix":    job_prefix,
                "content_type": content_type,
                "status":       "draft",
                "created_at":   created_at,
            })
        }

    except Exception as e:
        write_audit_event(
            action="CREATE_JOB",
            user_id=user_id or "unknown",
            entity_id=action_id or "unknown",
            result="FAIL",
            metadata={"error": str(e)}
        )
        print(f"FATAL ERROR: {str(e)}")
        return {
            "statusCode": 500,
            "headers":    {"Access-Control-Allow-Origin": "*"},
            "body":       json.dumps({"error": str(e)})
        }

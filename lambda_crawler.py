import json
import uuid
import requests
import boto3
import os
import base64
from datetime import datetime
from bs4 import BeautifulSoup

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")
dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table(os.environ.get("DYNAMO_TABLE", "AIMarketingHistory"))

TEXT_MODEL = os.environ.get("TEXT_MODEL", "us.amazon.nova-micro-v1:0")


def get_user_id(event):
    # Method 1: API Gateway request context
    try:
        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        if claims.get("sub"):
            print(f"Got user_id from requestContext: {claims['sub']}")
            return claims["sub"]
    except Exception as e:
        print(f"requestContext method failed: {str(e)}")

    # Method 2: Parse JWT manually
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
                print(f"Got user_id from JWT: {sub}")
                return sub
    except Exception as e:
        print(f"JWT method failed: {str(e)}")

    print("WARNING: Could not extract user_id")
    return None


def extract_website_content(url):
    try:
        html = requests.get(url, timeout=10).text
        soup = BeautifulSoup(html, "html.parser")
        return {
            "title": soup.title.string.strip() if soup.title else "",
            "h1": [h.get_text(strip=True) for h in soup.find_all("h1")],
            "h2": [h.get_text(strip=True) for h in soup.find_all("h2")],
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
        info.get("h1", []) +
        info.get("h2", []) +
        info.get("paragraphs", [])
    )[:3000]

    try:
        prompt = (
            "You are a business classifier. "
            "Return ONLY the business type as a short noun phrase. "
            "No sentences, no explanations.\n\n"
            f"Website content:\n{text}"
        )
        return call_bedrock(prompt, max_tokens=50)
    except Exception as e:
        return f"Business ({str(e)[:50]})"


def generate_marketing_content(marketing_prompt, content_type, platforms):
    try:
        platforms_str = ", ".join(platforms) if platforms else "social media"

        full_prompt = (
            f"You are an expert marketing copywriter.\n\n"
            f"{marketing_prompt}\n\n"
            f"Create {content_type} marketing content targeting {platforms_str}.\n\n"
            f"Return ONLY valid JSON with no extra text:\n"
            f'{{"caption": "marketing text here", "hashtags": ["#tag1", "#tag2"]}}'
        )

        text = call_bedrock(full_prompt, max_tokens=1000)

        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    except Exception as e:
        print(f"generate_marketing_content error: {str(e)}")
        return {
            "caption": f"Check out our latest offerings! {marketing_prompt[:200]}",
            "hashtags": ["#marketing", "#business"]
        }


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        url = body.get("url")
        content_type = body.get("contentType", "flyer")
        platforms = body.get("platforms", ["social"])

        if not url:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "URL is required"})
            }

        # Get user_id
        user_id = get_user_id(event)
        print(f"DEBUG user_id: '{user_id}'")

        # Crawl website
        website_info = extract_website_content(url)
        if "error" in website_info:
            return {
                "statusCode": 500,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": website_info["error"]})
            }

        # Classify business
        business_type = classify_business(website_info)

        # Build marketing prompt
        marketing_prompt = (
            f"Website: {website_info.get('title')}\n"
            f"Business Type: {business_type}\n"
            f"Headings: {', '.join(website_info.get('h1', []))}\n"
            f"Details: {' '.join(website_info.get('paragraphs', [])[:5])[:1000]}\n\n"
            f"Create {content_type} marketing content for this business."
        )

        # Generate marketing content
        marketing_output = generate_marketing_content(
            marketing_prompt, content_type, platforms
        )

        # Save to DynamoDB
        action_id = str(uuid.uuid4())
        created_at = datetime.utcnow().isoformat()

        if user_id:
            try:
                table.put_item(Item={
                    "action_id": action_id,
                    "userId": user_id,
                    "user_id": user_id,
                    "business": business_type,
                    "input_value": url,
                    "prompt": marketing_prompt,
                    "caption": marketing_output.get("caption", ""),
                    "hashtags": marketing_output.get("hashtags", []),
                    "platforms": platforms,
                    "content_type": content_type,
                    "status": "generated",
                    "createdAt": created_at,
                    "created_at": created_at,
                })
                print(f"Saved to history: action_id={action_id}, userId={user_id}")
            except Exception as e:
                print(f"Failed to save to history: {str(e)}")
        else:
            print("Skipping DynamoDB save — user_id is None")

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
            },
            "body": json.dumps({
                "websiteData": {
                    "title": website_info["title"],
                    "h1": website_info["h1"],
                    "h2": website_info["h2"],
                },
                "businessType": business_type,
                "marketing": marketing_output,
                "action_id": action_id,
                "created_at": created_at,
            })
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }

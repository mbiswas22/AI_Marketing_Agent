import json
import requests
from bs4 import BeautifulSoup
import boto3

lambda_client = boto3.client("lambda")
bedrock = boto3.client("bedrock-runtime", region_name="us-east-2")

# ───────────────────────────────────────────────────────────────
# Crawl Website
# ───────────────────────────────────────────────────────────────
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

# ───────────────────────────────────────────────────────────────
# AI Business Classification (Works for ANY Business)
# ───────────────────────────────────────────────────────────────
def classify_business(info):
    text = " ".join(
        info.get("h1", []) +
        info.get("h2", []) +
        info.get("paragraphs", [])
    )[:3000]  # truncate to avoid token overflow

    try:
        response = bedrock.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 50,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a business classifier. "
                            "You ALWAYS return only the business type as a short noun phrase. "
                            "No sentences, no explanations."
                        )
                    },
                    {
                        "role": "user",
                        "content": (
                            "Analyze this website content and return ONLY the business type:\n\n"
                            f"{text}"
                        )
                    }
                ]
            })
        )

        output = json.loads(response["body"].read())
        return output["content"][0]["text"].strip()

    except Exception as e:
        return f"Unknown ({str(e)})"

# ───────────────────────────────────────────────────────────────
# Lambda Handler
# ───────────────────────────────────────────────────────────────
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

        # Crawl website
        website_info = extract_website_content(url)
        if "error" in website_info:
            return {
                "statusCode": 500,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": website_info["error"]})
            }

        # AI Business Classification
        business_type = classify_business(website_info)

        # Build marketing prompt
        marketing_prompt = (
            f"Website: {website_info.get('title')}\n"
            f"Business Type: {business_type}\n"
            f"Headings: {', '.join(website_info.get('h1', []))}\n"
            f"Details: {' '.join(website_info.get('paragraphs', [])[:5])[:1000]}\n\n"
            f"Create {content_type} marketing content for this business targeting {', '.join(platforms)}."
        )

        # Invoke your existing marketing Lambda
        marketing_response = lambda_client.invoke(
            FunctionName="generateMarketingContentLambda",
            InvocationType="RequestResponse",
            Payload=json.dumps({
                "prompt": marketing_prompt,
                "business": business_type,
                "contentType": content_type,
                "platforms": platforms
            })
        )

        marketing_output = json.loads(marketing_response["Payload"].read())

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({
                "websiteData": {
                    "title": website_info["title"],
                    "h1": website_info["h1"],
                    "h2": website_info["h2"]
                },
                "businessType": business_type,
                "marketing": marketing_output
            })
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }

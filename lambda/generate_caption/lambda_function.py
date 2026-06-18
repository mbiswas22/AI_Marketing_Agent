import json
import uuid
import boto3
from datetime import datetime

# ============================================================
# CONFIGURATION — toggle to switch between mock and real
# ============================================================
USE_REAL_AI_TEXT = True    # Set False to use mock captions
# ============================================================

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('kushtest-MarketingActions')

bedrock_text = boto3.client('bedrock-runtime', region_name='us-east-2')


def generate_text_content(prompt, business, content_type, platforms, model_id):
    if not USE_REAL_AI_TEXT:
        return {
            "caption": f"🔥 {prompt} is here! Don't miss this limited-time offer from {business}.",
            "hashtags": ["#Marketing", "#Promotion", "#Sale", "#Business", "#ShopNow"],
            "call_to_action": "Shop now!"
        }

    platforms_str = ', '.join(platforms) if platforms else 'social media'

    system_prompt = """You are an expert marketing copywriter. You create compelling,
    professional marketing content that drives engagement and conversions.
    Always respond with valid JSON only, no extra text."""

    user_prompt = f"""Create marketing content for the following:

Business: {business}
Content Type: {content_type}
Target Platforms: {platforms_str}
Campaign Details: {prompt}

Respond with ONLY this JSON format, nothing else:
{{
    "caption": "A compelling 2-3 sentence marketing caption that grabs attention and drives action",
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
    "call_to_action": "A short call to action phrase"
}}"""

    # Use the modelId passed from the frontend, fallback to Nova Lite
    bedrock_model_id = model_id or 'us.amazon.nova-2-lite-v1:0'

    response = bedrock_text.converse(
        modelId=bedrock_model_id,
        system=[{'text': system_prompt}],
        messages=[{'role': 'user', 'content': [{'text': user_prompt}]}],
        inferenceConfig={'maxTokens': 500, 'temperature': 0.7}
    )

    response_text = response['output']['message']['content'][0]['text'].strip()
    if '```json' in response_text:
        response_text = response_text.split('```json')[1].split('```')[0].strip()
    elif '```' in response_text:
        response_text = response_text.split('```')[1].split('```')[0].strip()

    return json.loads(response_text)


def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        prompt = body.get('prompt', '')
        business = body.get('business', 'My Business')
        content_type = body.get('contentType', 'flyer')
        platforms = body.get('platforms', [])
        model_id = body.get('modelId', '')

        result = generate_text_content(prompt, business, content_type, platforms, model_id)
        action_id = str(uuid.uuid4())

        table.put_item(
            Item={
                "action_id": action_id,
                "business": business,
                "content_type": content_type,
                "platforms": platforms,
                "input_type": "text",
                "input_value": prompt,
                "caption": result.get("caption", ""),
                "hashtags": result.get("hashtags", []),
                "call_to_action": result.get("call_to_action", ""),
                "model_id": model_id,
                "status": "draft",
                "created_at": datetime.utcnow().isoformat()
            }
        )

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*"
            },
            "body": json.dumps(result)
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }

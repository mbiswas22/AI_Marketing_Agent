import json
import uuid
import boto3
import base64
from datetime import datetime

# ============================================================
# CONFIGURATION — toggle to switch between mock and real
# ============================================================
USE_REAL_AI_IMAGE = True    # Set False to use placeholder image
# ============================================================

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('kushtest-MarketingActions')

# Bedrock client for IMAGES (us-west-2 — Stability AI)
bedrock_image = boto3.client('bedrock-runtime', region_name='us-west-2')

s3 = boto3.client('s3', region_name='us-east-2')
S3_BUCKET = 'kushtest-marketing-ai-assets'


def generate_image(image_prompt, action_id, model_id):
    if not USE_REAL_AI_IMAGE:
        return "https://placehold.co/1024x1024/7c3aed/ffffff?text=AI+Generated+Flyer"

    bedrock_model_id = model_id or 'stability.stable-image-core-v1:1'

    response = bedrock_image.invoke_model(
        modelId=bedrock_model_id,
        body=json.dumps({
            "prompt": image_prompt,
            "aspect_ratio": "1:1",
            "output_format": "png"
        }),
        accept='application/json',
        contentType='application/json'
    )

    response_body = json.loads(response['body'].read())
    image_base64 = response_body['images'][0]
    image_bytes = base64.b64decode(image_base64)

    s3_key = f"generated/{action_id}.png"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=image_bytes,
        ContentType='image/png'
    )

    return f"https://{S3_BUCKET}.s3.us-east-2.amazonaws.com/{s3_key}"


def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        action_id = body.get('action_id', str(uuid.uuid4()))
        prompt = body.get('prompt', '')
        business = body.get('business', 'My Business')
        content_type = body.get('contentType', 'flyer')
        platforms = body.get('platforms', [])
        model_id = body.get('modelId', '')

        platforms_str = ', '.join(platforms) if platforms else 'social media'
        image_prompt = f"""Professional marketing {content_type} for {business}.
Campaign: {prompt}.
Style: Modern, clean, vibrant colors, professional typography, high quality.
Platform: {platforms_str}.
Include relevant visuals, branding elements, and make it visually striking."""

        image_url = generate_image(image_prompt, action_id, model_id)

        table.update_item(
            Key={"action_id": action_id},
            UpdateExpression="SET image_url = :url, #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":url": image_url,
                ":status": "draft"
            }
        )

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*"
            },
            "body": json.dumps({
                "imageUrl": image_url,
                "action_id": action_id
            })
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }

import json
import uuid
import os
import boto3
import base64
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DYNAMO_TABLE'])
bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
s3 = boto3.client('s3')
BUCKET = os.environ['S3_BUCKET']


def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        user_id = "anonymous-user"
        action_id = str(uuid.uuid4())

        input_type = body.get('input_type', 'text')
        input_value = body.get('input_value', body.get('prompt', ''))
        business = body.get('business', 'My Business')
        content_type = body.get('content_type', 'flyer')
        platforms = body.get('platforms', [])
        model_id = body.get('modelId', 'us.amazon.nova-2-lite-v1:0')

        if input_type == 'image' and body.get('image_data'):
            image_bytes = base64.b64decode(body['image_data'])
            upload_key = f"uploads/{user_id}/{action_id}.png"
            s3.put_object(Bucket=BUCKET, Key=upload_key, Body=image_bytes, ContentType='image/png')
            input_value = upload_key

        caption_data = generate_caption( input_type,
                                            input_value,
                                            business,
                                            content_type,
                                            platforms,
                                            model_id)

        created_at = datetime.utcnow().isoformat()
        table.put_item(Item={
            'action_id': action_id,
            'user_id': user_id,
            'business': business,
            'content_type': content_type,
            'platforms': platforms,
            'input_type': input_type,
            'input_value': input_value,
            'model_id': model_id,
            'caption': caption_data.get('caption', ''),
            'hashtags': caption_data.get('hashtags', []),
            'call_to_action': caption_data.get('call_to_action', ''),
            'image_prompt': caption_data.get('image_prompt', ''),
            'status': 'draft',
            'created_at': created_at
        })

        return api_response(200, {
            'action_id': action_id,
            'caption': caption_data.get('caption', ''),
            'hashtags': caption_data.get('hashtags', []),
            'call_to_action': caption_data.get('call_to_action', ''),
            'image_prompt': caption_data.get('image_prompt', '')
        })

    except Exception as e:
        print(f"Error: {str(e)}")
        return api_response(500, {'error': str(e)})


def generate_caption(input_type, input_value, business, content_type, platforms, model_id):
    if input_type == 'website':
        context = crawl_website(input_value)
    elif input_type == 'image':
        context = (
            f"The user uploaded a reference image (S3 key: {input_value}). "
            f"Create compelling {content_type} marketing content for {business} "
            f"that would pair well with a product or brand image."
        )
    else:
        context = input_value

    platforms_str = ', '.join(platforms) if platforms else 'social media'

    prompt = (
        f"You are a marketing copywriter for {business}. Based on the context below, "
        f"create compelling {content_type} marketing content optimised for {platforms_str}.\n\n"
        f"Context: {context}\n\n"
        "Respond with ONLY a JSON object (no markdown, no backticks) containing:\n"
        '- "caption": engaging social media caption (2-3 sentences, under 280 characters)\n'
        '- "hashtags": JSON array of 5-8 relevant hashtag strings, each starting with #\n'
        '- "call_to_action": a short call-to-action phrase (e.g. "Shop now!", "Learn more")\n'
        '- "image_prompt": detailed visual description for an AI image generator'
    )

    response = bedrock.converse(
        modelId=model_id or 'us.amazon.nova-2-lite-v1:0',
        messages=[{'role': 'user', 'content': [{'text': prompt}]}],
        inferenceConfig={'maxTokens': 1024, 'temperature': 0.7}
    )

    text = response['output']['message']['content'][0]['text'].strip()

    try:
        cleaned = text
        if cleaned.startswith('```'):
            cleaned = cleaned.split('\n', 1)[1].rsplit('```', 1)[0]
        return json.loads(cleaned.strip())
    except (json.JSONDecodeError, IndexError):
        return {
            'caption': text[:280],
            'hashtags': ['#marketing', '#socialmedia', '#business'],
            'call_to_action': 'Learn more',
            'image_prompt': f"Professional marketing {content_type} image for {business}: {context[:150]}"
        }


def crawl_website(url):
    import urllib.request
    from html.parser import HTMLParser

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'MarketingAgent/1.0 (AWS Lambda)'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Crawl error: {e}")
        return f"Could not fetch {url}. Create general marketing content for this URL."

    class BrandExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.title = ''
            self.meta_description = ''
            self.headings = []
            self.paragraphs = []
            self.current_tag = ''
            self.current_text = ''
            self.skip_tags = {'script', 'style', 'nav', 'footer', 'header'}
            self.in_skip = 0

        def handle_starttag(self, tag, attrs):
            self.current_tag = tag
            self.current_text = ''
            attrs_dict = dict(attrs)
            if tag in self.skip_tags:
                self.in_skip += 1
            if tag == 'meta':
                name = attrs_dict.get('name', '').lower()
                prop = attrs_dict.get('property', '').lower()
                content = attrs_dict.get('content', '')
                if name == 'description' or prop == 'og:description':
                    self.meta_description = content

        def handle_endtag(self, tag):
            if tag in self.skip_tags:
                self.in_skip -= 1
            if self.in_skip > 0:
                return
            text = self.current_text.strip()
            if not text:
                return
            if tag == 'title' and not self.title:
                self.title = text
            elif tag in ('h1', 'h2', 'h3') and len(self.headings) < 5:
                self.headings.append(text)
            elif tag == 'p' and len(text) > 20 and len(self.paragraphs) < 5:
                self.paragraphs.append(text[:300])
            self.current_text = ''

        def handle_data(self, data):
            if self.in_skip <= 0:
                self.current_text += data

    parser = BrandExtractor()
    try:
        parser.feed(html)
    except Exception:
        pass

    parts = [f"Website: {url}"]
    if parser.title:
        parts.append(f"Business: {parser.title}")
    if parser.meta_description:
        parts.append(f"Description: {parser.meta_description}")
    if parser.headings:
        parts.append(f"Key headings: {'; '.join(parser.headings)}")
    if parser.paragraphs:
        parts.append(f"Content: {' '.join(parser.paragraphs[:3])}")

    brand_context = '\n'.join(parts)
    return brand_context if len(brand_context) > 50 else f"Website at {url}. Create general marketing content."


def api_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, default=str)
    }

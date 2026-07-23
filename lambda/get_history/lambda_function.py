import json
import os
import boto3
from boto3.dynamodb.conditions import Attr
from auth import get_user
from response import api_response

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table(os.environ['DYNAMO_TABLE'])
s3 = boto3.client('s3', region_name='us-east-2')
BUCKET = os.environ['S3_BUCKET']


def lambda_handler(event, context):
    try:
        user = get_user(event)
        print(f"User ID: {user}")
        user_id = user['user_id']

        params      = event.get('queryStringParameters') or {}
        business_id = params.get('businessId')

        # Filter by businessId if provided, otherwise fall back to user_id
        if business_id:
            filter_expr = Attr('business_id').eq(business_id)
        else:
            filter_expr = Attr('user_id').eq(user_id) | Attr('userId').eq(user_id)

        response = table.scan(FilterExpression=filter_expr)
        items = response.get('Items', [])

        while 'LastEvaluatedKey' in response:
            response = table.scan(
                FilterExpression=filter_expr,
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            items.extend(response.get('Items', []))

        for item in items:
            if item.get('image_key'):
                try:
                    item['image_url'] = s3.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': BUCKET, 'Key': item['image_key']},
                        ExpiresIn=3600
                    )
                except Exception:
                    pass
            if item.get('s3_key') and not item.get('image_url'):
                try:
                    item['image_url'] = s3.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': BUCKET, 'Key': item['s3_key']},
                        ExpiresIn=3600
                    )
                except Exception:
                    pass
            if item.get('html_key'):
                try:
                    item['html_url'] = s3.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': BUCKET, 'Key': item['html_key']},
                        ExpiresIn=3600
                    )
                except Exception:
                    pass

        items.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return api_response(200, json.dumps(items, default=str))

    except Exception as e:
        print(f"Error: {str(e)}")
        return api_response(500, {'error': str(e)})

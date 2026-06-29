import json
import os
import boto3
from boto3.dynamodb.conditions import Attr
from auth import get_user
from response import api_response
from authorization import require_role


dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DYNAMO_TABLE'])
s3 = boto3.client('s3')
BUCKET = os.environ['S3_BUCKET']


def lambda_handler(event, context):
    try:
        user = get_user(event)
        print(f"User ID: {user}")
        user_id = user['user_id']

        response = table.scan(FilterExpression=Attr('user_id').eq(user_id))
        items = response['Items']

        while 'LastEvaluatedKey' in response:
            response = table.scan(
                FilterExpression=Attr('user_id').eq(user_id),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            items.extend(response['Items'])

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

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,OPTIONS',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(items, default=str)
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }

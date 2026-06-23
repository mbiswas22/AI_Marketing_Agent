import boto3
import json

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('kushtest-MarketingActions')


def lambda_handler(event, context):
    try:
        response = table.scan()
        items = response["Items"]

        # Sort by most recent first
        items.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*"
            },
            "body": json.dumps(items)
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }

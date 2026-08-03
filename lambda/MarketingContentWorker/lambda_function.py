import json
import uuid
import boto3
import datetime
import urllib.request
import urllib.parse
from botocore.exceptions import ClientError
 
REGION = "us-east-2"
 
dynamodb = boto3.resource("dynamodb", region_name=REGION)
 
schedules_table = dynamodb.Table("ContentSchedules")
connections_table = dynamodb.Table("SocialConnections")
logs_table = dynamodb.Table("ScheduleLogs")
 
 
def now_iso():
    return datetime.datetime.utcnow().isoformat()
 
 
def get_schedule(schedule_id):
    response = schedules_table.get_item(
        Key={"schedule_id": schedule_id}
    )
    return response.get("Item")
 
 
def get_social_connection(user_id, platform):
    response = connections_table.get_item(
        Key={
            "user_id": user_id,
            "platform": platform
        }
    )
    return response.get("Item")
 
 
def create_content(content_type, topic):
    """
    Replace this placeholder with your AI/image/video generation logic.
    Example integrations:
    - Amazon Bedrock for text/image generation
    - Your own image generation API
    - Your flyer/reel creation service
    """
 
    if content_type == "post":
        return {
            "type": "post",
            "text": f"Check out our latest update: {topic}. Shop now and discover something unique!"
        }
 
    if content_type == "flyer":
        return {
            "type": "flyer",
            "text": f"Promotional flyer for {topic}",
            "media_url": "https://example.com/generated-flyer.png"
        }
 
    if content_type == "image":
        return {
            "type": "image",
            "text": f"New image campaign for {topic}",
            "media_url": "https://example.com/generated-image.png"
        }
 
    if content_type == "reel":
        return {
            "type": "reel",
            "text": f"New reel campaign for {topic}",
            "media_url": "https://example.com/generated-reel.mp4"
        }
 
    raise ValueError(f"Unsupported content type: {content_type}")
 
 
def post_to_facebook(connection, content):
    """
    Placeholder Facebook posting logic.
    Replace with real Facebook Graph API endpoint.
    """
 
    access_token = connection["access_token"]
    page_id = connection.get("page_id")
 
    if not page_id:
        raise ValueError("Facebook page_id is missing")
 
    url = f"https://graph.facebook.com/v20.0/{page_id}/feed"
 
    payload = {
        "message": content.get("text", ""),
        "access_token": access_token
    }
 
    encoded_payload = urllib.parse.urlencode(payload).encode("utf-8")
 
    request = urllib.request.Request(url, data=encoded_payload, method="POST")
 
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))
 
 
def post_to_linkedin(connection, content):
    """
    Placeholder LinkedIn posting logic.
    Replace with LinkedIn API implementation.
    """
 
    return {
        "status": "mock_success",
        "platform": "linkedin",
        "message": "LinkedIn post simulated successfully"
    }
 
 
def post_to_youtube(connection, content):
    """
    Placeholder YouTube posting logic.
    Replace with YouTube upload API implementation.
    Usually used for reels/videos, not plain text posts.
    """
 
    return {
        "status": "mock_success",
        "platform": "youtube",
        "message": "YouTube upload simulated successfully"
    }
 
 
def post_to_social(platform, connection, content):
    platform = platform.lower()
 
    if platform == "facebook":
        return post_to_facebook(connection, content)
 
    if platform == "linkedin":
        return post_to_linkedin(connection, content)
 
    if platform == "youtube":
        return post_to_youtube(connection, content)
 
    raise ValueError(f"Unsupported platform: {platform}")
 
 
def write_log(schedule_id, user_id, platform, status, message, response_data=None):
    log_id = str(uuid.uuid4())
 
    logs_table.put_item(
        Item={
            "log_id": log_id,
            "schedule_id": schedule_id,
            "user_id": user_id,
            "platform": platform,
            "status": status,
            "message": message,
            "response_data": response_data or {},
            "created_at": now_iso()
        }
    )
 
    return log_id
 
 
def update_schedule_status(schedule_id, status):
    schedules_table.update_item(
        Key={"schedule_id": schedule_id},
        UpdateExpression="SET last_run_status = :status, last_run_at = :last_run_at",
        ExpressionAttributeValues={
            ":status": status,
            ":last_run_at": now_iso()
        }
    )
 
 
def lambda_handler(event, context):
    print("Received event:", json.dumps(event))
 
    schedule_id = event.get("schedule_id")
 
    if not schedule_id:
        raise ValueError("schedule_id is required")
 
    try:
        schedule = get_schedule(schedule_id)
 
        if not schedule:
            raise ValueError(f"Schedule not found: {schedule_id}")
 
        if schedule.get("status") != "active":
            write_log(
                schedule_id=schedule_id,
                user_id=schedule.get("user_id", "unknown"),
                platform=schedule.get("platform", "unknown"),
                status="skipped",
                message="Schedule is inactive"
            )
            return {
                "statusCode": 200,
                "body": "Schedule inactive. Skipped."
            }
 
        user_id = schedule["user_id"]
        platform = schedule["platform"]
        content_type = schedule["content_type"]
        topic = schedule.get("topic", "new promotion")
 
        connection = get_social_connection(user_id, platform)
 
        if not connection:
            raise ValueError(f"Social connection not found for {user_id} - {platform}")
 
        content = create_content(content_type, topic)
 
        post_response = post_to_social(platform, connection, content)
 
        update_schedule_status(schedule_id, "success")
 
        write_log(
            schedule_id=schedule_id,
            user_id=user_id,
            platform=platform,
            status="success",
            message="Content generated and posted successfully",
            response_data=post_response
        )
 
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Success",
                "schedule_id": schedule_id,
                "platform": platform,
                "content_type": content_type
            })
        }
 
    except Exception as error:
        print("Error:", str(error))
 
        try:
            update_schedule_status(schedule_id, "failed")
            write_log(
                schedule_id=schedule_id,
                user_id="unknown",
                platform="unknown",
                status="failed",
                message=str(error)
            )
        except Exception as log_error:
            print("Failed to write log:", str(log_error))
 
        raise error
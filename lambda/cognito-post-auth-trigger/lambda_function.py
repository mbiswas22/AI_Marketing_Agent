import uuid
import boto3
from datetime import datetime

dynamodb    = boto3.resource("dynamodb", region_name="us-east-2")
audit_table = dynamodb.Table("AuditEvent")


def lambda_handler(event, context):
    try:
        user_attrs = event.get("request", {}).get("userAttributes", {})
        user_id    = user_attrs.get("sub", "unknown")
        email      = user_attrs.get("email", "")
        pool_id    = event.get("userPoolId", "")

        event_id = "EVT-" + str(uuid.uuid4())[:8].upper()
        audit_table.put_item(Item={
            "eventId":   event_id,
            "action":    "LOGIN",
            "userId":    user_id,
            "entityId":  user_id,
            "result":    "SUCCESS",
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": {
                "email":      email,
                "userPoolId": pool_id,
            }
        })
        print(f"Wrote audit event: {event_id} action=LOGIN entity={user_id}")
    except Exception as e:
        # Never block login — log and pass through
        print(f"Failed to write LOGIN audit event: {str(e)}")

    # Cognito triggers must return the event unchanged
    return event

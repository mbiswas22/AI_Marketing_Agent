import json
import os

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


SENDGRID_API_KEY = os.environ["SENDGRID_API_KEY"]
FROM_EMAIL = os.environ["FROM_EMAIL"]


def lambda_handler(event, context):

    try:

        body = json.loads(event["body"])

        to_email = body["toEmail"]

        subject = body["subject"]

        message = body["message"]


        email = Mail(

            from_email=FROM_EMAIL,

            to_emails=to_email,

            subject=subject,

            html_content=message

        )


        sg = SendGridAPIClient(SENDGRID_API_KEY)

        response = sg.send(email)

        return {

            "statusCode":200,

            "headers":{

                "Access-Control-Allow-Origin":"*",

                "Access-Control-Allow-Headers":"*"

            },

            "body":json.dumps({

                "message":"Email sent successfully",

                "status":response.status_code

            })

        }

    except Exception as e:

        print(str(e))

        return {

            "statusCode":500,

            "headers":{

                "Access-Control-Allow-Origin":"*"

            },

            "body":json.dumps({

                "error":str(e)

            })

        }
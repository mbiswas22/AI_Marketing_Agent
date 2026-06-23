# Lambda Functions

Each subfolder is a separate AWS Lambda function. Deploy each independently.

| Folder | Handler | API Gateway Route | Description |
|---|---|---|---|
| `generate_caption/` | `lambda_function.lambda_handler` | `POST /generate` | Generates marketing caption & hashtags via Bedrock |
| `get_history/` | `lambda_function.lambda_handler` | `GET /history` | Returns all items from DynamoDB sorted by date |
| `generate_asset/` | `lambda_function.lambda_handler` | `POST /asset` | Generates marketing image via Bedrock, stores in S3 |
| `get_models/` | `lambda_function.lambda_handler` | `GET /models?category=text\|image\|video` | Returns top 5 active Bedrock models for a given category |

---

## get_models

Queries `bedrock:ListFoundationModels` dynamically — no hardcoded model lists.  
Returns up to 5 active models matching the requested category.

**Required IAM permission:**
```json
{
  "Effect": "Allow",
  "Action": "bedrock:ListFoundationModels",
  "Resource": "*"
}
```

**Example request:**
```
GET /models?category=text
GET /models?category=image
GET /models?category=video
```

**Example response:**
```json
[
  { "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0", "label": "Claude 3.5 Sonnet v2", "description": "Best for long-form, nuanced text" },
  ...
]
```

---

## generate_caption

Accepts `modelId` from the frontend so the user-selected Bedrock model is used.

**Request body:**
```json
{
  "prompt": "Summer sale campaign",
  "business": "Acme Corp",
  "contentType": "flyer",
  "platforms": ["facebook", "instagram"],
  "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

---

## Deployment

1. Zip the contents of each subfolder (just `lambda_function.py`)
2. Upload to the corresponding Lambda function in AWS Console
3. Set handler to `lambda_function.lambda_handler`
4. Ensure the Lambda execution role has permissions for Bedrock, DynamoDB, and S3 as needed

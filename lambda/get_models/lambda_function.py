import json
import boto3

bedrock = boto3.client('bedrock', region_name='us-east-2')

# Maps UI category to Bedrock modality / name filters
CATEGORY_FILTERS = {
    "text":  {"modalities": ["TEXT"],        "keywords": ["claude", "titan-text", "llama", "mistral", "nova-lite", "nova-pro"]},
    "image": {"modalities": ["IMAGE"],       "keywords": ["titan-image", "stable", "nova-canvas"]},
    "video": {"modalities": ["VIDEO"],       "keywords": ["nova-reel", "luma", "stable-video"]},
}

# Friendly display names for known model IDs
MODEL_LABELS = {
    "anthropic.claude-3-5-sonnet-20241022-v2:0": ("Claude 3.5 Sonnet v2",    "Best for long-form, nuanced text"),
    "anthropic.claude-3-haiku-20240307-v1:0":    ("Claude 3 Haiku",           "Fast & cost-efficient text"),
    "anthropic.claude-3-sonnet-20240229-v1:0":   ("Claude 3 Sonnet",          "Balanced quality and speed"),
    "amazon.titan-text-premier-v1:0":            ("Titan Text Premier",        "Amazon's flagship text model"),
    "amazon.nova-lite-v1:0":                     ("Nova Lite",                 "Fast, affordable Amazon model"),
    "amazon.nova-pro-v1:0":                      ("Nova Pro",                  "High-capability Amazon model"),
    "meta.llama3-70b-instruct-v1:0":             ("Llama 3 70B",               "Open-weight, strong reasoning"),
    "mistral.mistral-large-2402-v1:0":           ("Mistral Large",             "Strong multilingual support"),
    "amazon.titan-image-generator-v2:0":         ("Titan Image Generator v2",  "Amazon's latest image model"),
    "stability.stable-diffusion-xl-v1":          ("Stable Diffusion XL",       "High-quality photorealistic images"),
    "stability.stable-image-core-v1:0":          ("Stable Image Core",         "Fast creative images"),
    "stability.stable-image-ultra-v1:0":         ("Stable Image Ultra",        "Ultra-detailed image generation"),
    "amazon.nova-canvas-v1:0":                   ("Nova Canvas",               "Amazon Nova image generation"),
    "amazon.nova-reel-v1:0":                     ("Nova Reel",                 "Amazon's video generation model"),
    "luma.ray-v2:0":                             ("Luma Ray v2",               "Cinematic video generation"),
}


def lambda_handler(event, context):
    try:
        category = (event.get("queryStringParameters") or {}).get("category", "text").lower()

        if category not in CATEGORY_FILTERS:
            category = "text"

        keywords = CATEGORY_FILTERS[category]["keywords"]

        # Fetch all foundation models available in the account
        paginator = bedrock.get_paginator('list_foundation_models')
        all_models = []
        for page in paginator.paginate():
            all_models.extend(page.get("modelSummaries", []))

        # Filter to active models matching the category keywords
        matched = [
            m for m in all_models
            if m.get("modelLifecycle", {}).get("status") == "ACTIVE"
            and any(kw in m["modelId"].lower() for kw in keywords)
        ]

        # Sort by modelId for deterministic ordering, take top 5
        matched.sort(key=lambda m: m["modelId"])
        top5 = matched[:5]

        result = []
        for m in top5:
            mid = m["modelId"]
            label, description = MODEL_LABELS.get(mid, (m.get("modelName", mid), ""))
            result.append({
                "modelId": mid,
                "label": label,
                "description": description
            })

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

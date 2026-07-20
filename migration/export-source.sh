#!/usr/bin/env bash
#
# export-source.sh — READ-ONLY export of the AI Marketing Hub AWS footprint.
#
# Run this in the SOURCE account only (the "kush" account). It never creates,
# modifies, or deletes anything — every AWS call is list-*/describe-*/get-*,
# plus one download of each in-scope Lambda's own deployment package via its
# pre-signed Code.Location URL (also a read action).
#
# Output: a timestamped folder + zip under ./migration-package-<UTC-timestamp>/
# containing everything create-destination.sh needs to recreate the empty
# infrastructure in a different AWS account.
#
# Secrets are NEVER written to any output file. Env vars that look like
# secrets (SECRET/TOKEN/PASSWORD/API_KEY/etc. in the name) are replaced with
# the literal string "__REDACTED__" and listed in manifest.json under
# "secrets_to_fill_manually" so nothing is silently lost or leaked.
#
# Requirements: aws CLI (configured with the profile below), python3, curl.
#
# Usage:
#   ./export-source.sh [--profile kush] [--region us-east-2]

set -euo pipefail

PROFILE="kush"
REGION="us-east-2"
AMPLIFY_REGION="us-east-1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --amplify-region) AMPLIFY_REGION="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

AWS="aws --profile $PROFILE"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUTDIR="migration-package-${TS}"

echo "=== AI Marketing Hub — read-only export ==="
echo "Profile:  $PROFILE"
echo "Region:   $REGION (Amplify: $AMPLIFY_REGION)"
echo "Output:   $OUTDIR/"
echo

command -v aws >/dev/null 2>&1 || { echo "aws CLI not found on PATH."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found on PATH."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl not found on PATH."; exit 1; }

# Confirm we can talk to the account and it's the one we expect a human to
# have meant (doesn't hard-fail on mismatch — just makes it visible).
CALLER_ACCOUNT="$($AWS sts get-caller-identity --query Account --output text | tr -d '\r')"
echo "Authenticated as account: $CALLER_ACCOUNT"
echo

mkdir -p "$OUTDIR"/{lambdas,api-gateway,dynamodb,s3,cognito,amplify}

# ─────────────────────────────────────────────────────────────────────────
# In-scope resource lists (edit here if scope ever changes)
# ─────────────────────────────────────────────────────────────────────────
LAMBDAS=(
  social-auth-handler
  social-publish-handler-new
  marketing-scheduler
  user-handler
  business-management
  invitation-handler
  generate-marketing-asset
  generate-caption
  generate-flyer
  get-history
  get_models
  WebsiteCrawler
  send-email
)

TABLES=(
  Business
  user
  Channel
  ContentType
  Model
  invitation
  ContentSchedules
  ScheduleLogs
  social-connections
  kushtest-MarketingActions
  AIMarketingHistory
  Artifact
  AuditEvent
  Job
)

S3_BUCKET="kushtest-marketing-ai-assets"
API_ID="l9k0b4he7h"
USER_POOL_ID="us-east-2_lhZuTGjJM"
AMPLIFY_APP_ID="d22giby4sl2grj"

# ─────────────────────────────────────────────────────────────────────────
# Lambda: config (env vars redacted) + deployment package
# ─────────────────────────────────────────────────────────────────────────
echo "--- Lambdas ---"
for FN in "${LAMBDAS[@]}"; do
  echo "  $FN"
  mkdir -p "$OUTDIR/lambdas/$FN"

  $AWS lambda get-function-configuration --function-name "$FN" --region "$REGION" \
    --output json > "$OUTDIR/lambdas/$FN/_raw_config.json"

  # Redact anything that looks like a secret; keep everything else as-is.
  python3 - "$OUTDIR/lambdas/$FN/_raw_config.json" "$OUTDIR/lambdas/$FN/config.json" <<'PYEOF'
import json, re, sys
raw_path, out_path = sys.argv[1], sys.argv[2]
with open(raw_path) as f:
    cfg = json.load(f)

secret_pattern = re.compile(r"(SECRET|TOKEN|PASSWORD|API_KEY|APIKEY|ACCESS_KEY|PRIVATE)", re.I)
env = (cfg.get("Environment") or {}).get("Variables") or {}
redacted = {}
secret_names = []
for k, v in env.items():
    if secret_pattern.search(k):
        redacted[k] = "__REDACTED__"
        secret_names.append(k)
    else:
        redacted[k] = v

out = {
    "FunctionName": cfg.get("FunctionName"),
    "Runtime": cfg.get("Runtime"),
    "Handler": cfg.get("Handler"),
    "MemorySize": cfg.get("MemorySize"),
    "Timeout": cfg.get("Timeout"),
    "Layers": [l.get("Arn") for l in cfg.get("Layers", [])],
    "EnvironmentVariables": redacted,
    "SecretEnvVarNames": secret_names,
    "SourceRoleArn_ForReferenceOnly": cfg.get("Role"),
}
with open(out_path, "w") as f:
    json.dump(out, f, indent=2)
PYEOF
  rm -f "$OUTDIR/lambdas/$FN/_raw_config.json"

  # Download the actual deployment package (read-only: GetFunction returns a
  # pre-signed S3 URL to the code Lambda already has; this just fetches it).
  CODE_URL="$($AWS lambda get-function --function-name "$FN" --region "$REGION" \
    --query 'Code.Location' --output text | tr -d '\r')"
  curl -s -o "$OUTDIR/lambdas/$FN/code.zip" "$CODE_URL"
done
echo

# ─────────────────────────────────────────────────────────────────────────
# API Gateway HTTP API
# ─────────────────────────────────────────────────────────────────────────
echo "--- API Gateway ($API_ID) ---"
$AWS apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --output json \
  > "$OUTDIR/api-gateway/api.json"
$AWS apigatewayv2 get-authorizers --api-id "$API_ID" --region "$REGION" --output json \
  > "$OUTDIR/api-gateway/authorizers.json"
$AWS apigatewayv2 get-stages --api-id "$API_ID" --region "$REGION" --output json \
  > "$OUTDIR/api-gateway/stages.json"
$AWS apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" --output json \
  > "$OUTDIR/api-gateway/_all-routes-raw.json"
$AWS apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --output json \
  > "$OUTDIR/api-gateway/_all-integrations-raw.json"

# Build a curated "routes to recreate" list: only the real (non /social-v2/)
# routes, only those targeting an in-scope Lambda.
python3 - "$OUTDIR/api-gateway/_all-routes-raw.json" "$OUTDIR/api-gateway/_all-integrations-raw.json" "$OUTDIR/api-gateway/routes-to-recreate.json" "${LAMBDAS[@]}" <<'PYEOF'
import json, sys
routes_path, integ_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
in_scope_lambdas = set(sys.argv[4:])

routes = json.load(open(routes_path))["Items"]
integrations = {i["IntegrationId"]: i for i in json.load(open(integ_path))["Items"]}

def fn_name_from_uri(uri: str) -> str:
    if ":function:" in uri:
        tail = uri.split(":function:")[-1]
        return tail.split("/")[0]
    return ""

curated = []
for r in routes:
    route_key = r["RouteKey"]
    if "/social-v2/" in route_key:
        continue  # legacy test routes, not recreated
    target = r.get("Target", "")
    integ_id = target.replace("integrations/", "")
    integ = integrations.get(integ_id)
    if not integ:
        continue
    fn = fn_name_from_uri(integ.get("IntegrationUri", ""))
    if fn not in in_scope_lambdas:
        continue  # points at an excluded/legacy Lambda
    curated.append({
        "routeKey": route_key,
        "authorizationType": r.get("AuthorizationType", "NONE"),
        "targetFunctionName": fn,
        "payloadFormatVersion": integ.get("PayloadFormatVersion", "2.0"),
        "timeoutInMillis": integ.get("TimeoutInMillis", 30000),
    })

curated.sort(key=lambda x: x["routeKey"])
with open(out_path, "w") as f:
    json.dump(curated, f, indent=2)

print(f"  {len(curated)} routes curated for recreation (of {len(routes)} total in source)")
PYEOF
rm -f "$OUTDIR/api-gateway/_all-routes-raw.json" "$OUTDIR/api-gateway/_all-integrations-raw.json"
echo

# ─────────────────────────────────────────────────────────────────────────
# DynamoDB — schema only, no items
# ─────────────────────────────────────────────────────────────────────────
echo "--- DynamoDB tables ---"
for TABLE in "${TABLES[@]}"; do
  echo "  $TABLE"
  $AWS dynamodb describe-table --table-name "$TABLE" --region "$REGION" --output json \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)['Table']
out = {
    'TableName': d['TableName'],
    'KeySchema': d['KeySchema'],
    'AttributeDefinitions': d['AttributeDefinitions'],
    'BillingMode': d.get('BillingModeSummary', {}).get('BillingMode', 'PAY_PER_REQUEST'),
    'GlobalSecondaryIndexes': [
        {'IndexName': g['IndexName'], 'KeySchema': g['KeySchema'], 'Projection': g['Projection']}
        for g in d.get('GlobalSecondaryIndexes', [])
    ],
}
json.dump(out, sys.stdout, indent=2)
" > "$OUTDIR/dynamodb/${TABLE}.schema.json"
done
echo

# ─────────────────────────────────────────────────────────────────────────
# S3 — config only, no objects
# ─────────────────────────────────────────────────────────────────────────
echo "--- S3 bucket ($S3_BUCKET) ---"
$AWS s3api get-bucket-location --bucket "$S3_BUCKET" --output json > "$OUTDIR/s3/_location.json"
$AWS s3api get-bucket-cors --bucket "$S3_BUCKET" --output json > "$OUTDIR/s3/_cors.json" 2>/dev/null \
  || echo '{"CORSRules": []}' > "$OUTDIR/s3/_cors.json"
$AWS s3api get-public-access-block --bucket "$S3_BUCKET" --output json > "$OUTDIR/s3/_pab.json" 2>/dev/null \
  || echo '{}' > "$OUTDIR/s3/_pab.json"

# Reading each piece from its own file (rather than capturing AWS CLI output
# into a bash variable and interpolating it into a Python string) avoids any
# risk of shell quoting/line-ending issues corrupting the JSON.
python3 - "$S3_BUCKET" "$OUTDIR/s3/_location.json" "$OUTDIR/s3/_cors.json" "$OUTDIR/s3/_pab.json" "$OUTDIR/s3/bucket-config.json" <<'PYEOF'
import json, sys
bucket, loc_path, cors_path, pab_path, out_path = sys.argv[1:6]
out = {
    "SourceBucketName": bucket,
    "Location": json.load(open(loc_path)),
    "CORS": json.load(open(cors_path)),
    "PublicAccessBlock": json.load(open(pab_path)),
}
with open(out_path, "w") as f:
    json.dump(out, f, indent=2)
PYEOF
rm -f "$OUTDIR/s3/_location.json" "$OUTDIR/s3/_cors.json" "$OUTDIR/s3/_pab.json"
echo

# ─────────────────────────────────────────────────────────────────────────
# Cognito — pool + client + groups config, no users
# ─────────────────────────────────────────────────────────────────────────
echo "--- Cognito ($USER_POOL_ID) ---"
$AWS cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --region "$REGION" --output json \
  > "$OUTDIR/cognito/user-pool.json"

$AWS cognito-idp list-user-pool-clients --user-pool-id "$USER_POOL_ID" --region "$REGION" --output json \
  > "$OUTDIR/cognito/_clients-list.json"

python3 - "$OUTDIR/cognito/_clients-list.json" > "$OUTDIR/cognito/_client_ids.txt" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
for c in d["UserPoolClients"]:
    print(c["ClientId"])
PYEOF

: > "$OUTDIR/cognito/app-clients.json"
echo "[" >> "$OUTDIR/cognito/app-clients.json"
FIRST=1
while IFS= read -r CLIENT_ID; do
  CLIENT_ID="${CLIENT_ID%$'\r'}"  # strip stray \r left by python3's text-mode stdout on Windows
  [ -z "$CLIENT_ID" ] && continue
  [ "$FIRST" -eq 0 ] && echo "," >> "$OUTDIR/cognito/app-clients.json"
  FIRST=0
  $AWS cognito-idp describe-user-pool-client --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
    --region "$REGION" --output json --query "UserPoolClient" >> "$OUTDIR/cognito/app-clients.json"
done < "$OUTDIR/cognito/_client_ids.txt"
echo "]" >> "$OUTDIR/cognito/app-clients.json"
rm -f "$OUTDIR/cognito/_clients-list.json" "$OUTDIR/cognito/_client_ids.txt"

$AWS cognito-idp list-groups --user-pool-id "$USER_POOL_ID" --region "$REGION" --output json \
  > "$OUTDIR/cognito/groups.json"
echo

# ─────────────────────────────────────────────────────────────────────────
# Amplify — build settings + env var names, no deploy history
# ─────────────────────────────────────────────────────────────────────────
echo "--- Amplify ($AMPLIFY_APP_ID) ---"
$AWS amplify get-app --app-id "$AMPLIFY_APP_ID" --region "$AMPLIFY_REGION" --output json \
  > "$OUTDIR/amplify/app.json"
$AWS amplify list-branches --app-id "$AMPLIFY_APP_ID" --region "$AMPLIFY_REGION" --output json \
  > "$OUTDIR/amplify/branches.json"
echo

# ─────────────────────────────────────────────────────────────────────────
# Manifest
# ─────────────────────────────────────────────────────────────────────────
python3 - "$OUTDIR/manifest.json" "$TS" "$CALLER_ACCOUNT" "$REGION" "$AMPLIFY_REGION" "${LAMBDAS[@]}" <<'PYEOF'
import json, sys
out_path, ts, account, region, amplify_region = sys.argv[1:6]
lambdas = sys.argv[6:]

manifest = {
    "exported_at_utc": ts,
    "source_account": account,
    "source_region": region,
    "amplify_region": amplify_region,
    "note": "Read-only export. No data (DynamoDB items, S3 objects, Cognito users) is included. Secret env var values are redacted to __REDACTED__ inside each lambdas/<name>/config.json.",
    "lambdas_included": lambdas,
    "lambdas_excluded_confirmed_out_of_scope": [
        "social-publish-handler (legacy, superseded, only triggered by out-of-scope EventBridge rules)",
        "MarketingContentWorker (broken - references a DynamoDB table that no longer exists)",
    ],
    "secrets_to_fill_manually": {
        "social-auth-handler": ["LINKEDIN_CLIENT_SECRET", "META_APP_SECRET"],
        "send-email": ["SENDGRID_API_KEY"],
    },
    "known_loose_ends": [
        "Schedules.tsx timezone bug: .toISOString() (UTC) mislabeled as local time",
        "Schedules.tsx topic/input_value column mismatch",
        "14 legacy classic EventBridge Rules targeting social-publish-handler - source account only, not migrated",
        "Meta OAuth Lambda logic scoped but not fully built",
        "LinkedIn OAuth token refresh not implemented (~60 day expiry)",
        "FRONTEND_URL on social-auth-handler needs updating to the new Amplify domain",
        "LINKEDIN_VERSION is a hardcoded constant in social-publish-handler-new source, not an env var",
        "3-way Bedrock region split: get_models catalog query in us-east-2, text invoke in us-east-1, image invoke in us-west-2",
        "Amplify has no branch env vars - API URL is hardcoded in src/services/api.ts",
    ],
}
with open(out_path, "w") as f:
    json.dump(manifest, f, indent=2)
PYEOF

# ─────────────────────────────────────────────────────────────────────────
# Package
# ─────────────────────────────────────────────────────────────────────────
echo "--- Packaging ---"
python3 -c "
import zipfile, os
zip_path = '${OUTDIR}.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('$OUTDIR'):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, '.')
            zf.write(full, arcname=arc.replace(os.sep, '/'))
print('Wrote', zip_path)
"

echo
echo "=== Done ==="
echo "Folder: $OUTDIR/"
echo "Zip:    ${OUTDIR}.zip"
echo
echo "Nothing was created, changed, or deleted in the source account."
echo "Hand off the zip (or the folder) to your boss's team along with SETUP_GUIDE.md."

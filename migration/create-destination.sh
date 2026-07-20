#!/usr/bin/env bash
#
# create-destination.sh — Recreates the AI Marketing Hub's EMPTY infrastructure
# in YOUR OWN AWS account, from a migration package produced by export-source.sh.
#
# This script has never been run against a real destination account — the
# person who wrote it (an AI assistant) only had credentials for the SOURCE
# account and was never given access to this one. Read it before running it.
# Use --dry-run first: it prints every AWS CLI command it would run without
# executing any of them, so you can review the exact plan before committing.
#
# This script does NOT create an IAM execution role. You (or your AWS admin)
# must create one first — see SETUP_GUIDE.md for the exact permissions list —
# and pass its ARN in with --execution-role-arn.
#
# Order of operations: S3 -> DynamoDB -> Cognito -> Lambda -> API Gateway -> Amplify
# (matches dependency order: Lambdas need the execution role + table/bucket
# names to exist first; API Gateway needs the Lambdas and the Cognito pool;
# Amplify comes last and gets pointed at the finished API).
#
# Usage:
#   ./create-destination.sh \
#     --package-dir ./migration-package-XXXXXXXXTXXXXXXZ \
#     --execution-role-arn arn:aws:iam::<ACCOUNT>:role/<ROLE_NAME> \
#     --bucket-name <globally-unique-new-bucket-name> \
#     --secrets-file ./secrets.env \
#     --github-token <github-pat> \
#     --github-repo https://github.com/<your-org>/<your-fork> \
#     [--profile default] [--region us-east-2] [--amplify-region us-east-1] \
#     [--dry-run]
#
# secrets.env format (KEY=VALUE per line, see SETUP_GUIDE.md for where each
# value comes from):
#   LINKEDIN_CLIENT_ID=...
#   LINKEDIN_CLIENT_SECRET=...
#   META_APP_ID=...
#   META_APP_SECRET=...
#   META_CONFIG_ID=...
#   SENDGRID_API_KEY=...

set -euo pipefail

PROFILE="default"
REGION="us-east-2"
AMPLIFY_REGION="us-east-1"
PACKAGE_DIR=""
EXEC_ROLE_ARN=""
BUCKET_NAME=""
SECRETS_FILE=""
GITHUB_TOKEN=""
GITHUB_REPO=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-dir) PACKAGE_DIR="$2"; shift 2 ;;
    --execution-role-arn) EXEC_ROLE_ARN="$2"; shift 2 ;;
    --bucket-name) BUCKET_NAME="$2"; shift 2 ;;
    --secrets-file) SECRETS_FILE="$2"; shift 2 ;;
    --github-token) GITHUB_TOKEN="$2"; shift 2 ;;
    --github-repo) GITHUB_REPO="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --amplify-region) AMPLIFY_REGION="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift 1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^#//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────
# Pre-flight checks — fail loudly and early, never guess
# ─────────────────────────────────────────────────────────────────────────
FAIL=0
[[ -z "$PACKAGE_DIR" ]] && { echo "ERROR: --package-dir is required."; FAIL=1; }
[[ -n "$PACKAGE_DIR" && ! -d "$PACKAGE_DIR" ]] && { echo "ERROR: --package-dir '$PACKAGE_DIR' does not exist."; FAIL=1; }
[[ -z "$EXEC_ROLE_ARN" ]] && { echo "ERROR: --execution-role-arn is required. This script does not create IAM roles - see SETUP_GUIDE.md for what permissions it needs, have your AWS admin create it, then pass its ARN here."; FAIL=1; }
[[ -z "$BUCKET_NAME" ]] && { echo "ERROR: --bucket-name is required. S3 bucket names are globally unique across ALL AWS accounts - the source bucket name (kushtest-marketing-ai-assets) is already taken and cannot be reused. Pick your own unique name."; FAIL=1; }
[[ -z "$SECRETS_FILE" ]] && { echo "ERROR: --secrets-file is required. See the usage comment at the top of this script and SETUP_GUIDE.md for the format and where to get each value."; FAIL=1; }
[[ -n "$SECRETS_FILE" && ! -f "$SECRETS_FILE" ]] && { echo "ERROR: --secrets-file '$SECRETS_FILE' does not exist."; FAIL=1; }
[[ -z "$GITHUB_TOKEN" ]] && { echo "ERROR: --github-token is required to connect Amplify to your repo."; FAIL=1; }
[[ -z "$GITHUB_REPO" ]] && { echo "ERROR: --github-repo is required (the URL of YOUR fork/copy of the repo, not the original)."; FAIL=1; }
if [[ $FAIL -eq 1 ]]; then
  echo
  echo "Aborting - fix the above and re-run. Nothing was created."
  exit 1
fi

command -v aws >/dev/null 2>&1 || { echo "aws CLI not found on PATH."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found on PATH."; exit 1; }

AWS="aws --profile $PROFILE"

# Required manual/account-specific values. These are NEVER copied from the
# source export, even if a value happened to be present there (some, like
# LINKEDIN_CLIENT_ID, aren't cryptographic secrets by name but are still tied
# to the SOURCE account's own developer app registrations and must not be
# reused - your team registers your own Meta and LinkedIn developer apps).
REQUIRED_SECRETS=(LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET META_APP_ID META_APP_SECRET META_CONFIG_ID SENDGRID_API_KEY)

declare -A SECRET_VALUES
while IFS='=' read -r K V; do
  [[ -z "$K" || "$K" == \#* ]] && continue
  SECRET_VALUES["$K"]="$V"
done < "$SECRETS_FILE"

MISSING=()
for K in "${REQUIRED_SECRETS[@]}"; do
  if [[ -z "${SECRET_VALUES[$K]:-}" ]]; then
    MISSING+=("$K")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: --secrets-file is missing required values:"
  for K in "${MISSING[@]}"; do echo "  - $K"; done
  echo
  echo "See SETUP_GUIDE.md 'Registering your own OAuth apps' section for exactly"
  echo "where each of these comes from. Nothing was created."
  exit 1
fi

echo "=== AI Marketing Hub — destination create ==="
echo "Package:   $PACKAGE_DIR"
echo "Profile:   $PROFILE"
echo "Region:    $REGION (Amplify: $AMPLIFY_REGION)"
echo "Bucket:    $BUCKET_NAME"
echo "Exec role: $EXEC_ROLE_ARN"
echo "Dry run:   $([[ $DRY_RUN -eq 1 ]] && echo YES - nothing will actually be created || echo NO - this will create real resources)"
echo

if [[ $DRY_RUN -eq 0 ]]; then
  read -r -p "Type 'yes' to proceed and create real resources in this AWS account: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted by operator. Nothing was created."
    exit 0
  fi
fi

# run <description> -- <command...>
# Every mutating AWS CLI call in this script goes through this wrapper so
# --dry-run can print the exact command instead of executing it.
run() {
  local desc="$1"; shift
  echo ">> $desc"
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '   [DRY RUN] %q ' "$@"; echo
    echo "__DRYRUN__"
  else
    "$@"
  fi
}

SOURCE_BUCKET_NAME="kushtest-marketing-ai-assets"  # for env var substitution only

# ─────────────────────────────────────────────────────────────────────────
# 1. S3
# ─────────────────────────────────────────────────────────────────────────
echo "--- 1/6 S3 ---"
if [[ "$REGION" == "us-east-1" ]]; then
  run "create bucket $BUCKET_NAME" $AWS s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" || true
else
  run "create bucket $BUCKET_NAME" $AWS s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION" || true
fi

CORS_JSON="$(python3 -c "
import json
cfg = json.load(open('$PACKAGE_DIR/s3/bucket-config.json'))
print(json.dumps(cfg['CORS']))
" | tr -d '\r')"
echo "$CORS_JSON" > /tmp/_cors.json 2>/dev/null || echo "$CORS_JSON" > "${TMPDIR:-.}/_cors.json"
CORS_FILE="/tmp/_cors.json"; [[ -f "$CORS_FILE" ]] || CORS_FILE="${TMPDIR:-.}/_cors.json"
run "apply CORS to $BUCKET_NAME" $AWS s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration "file://$CORS_FILE"

run "block public access on $BUCKET_NAME" $AWS s3api put-public-access-block --bucket "$BUCKET_NAME" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo

# ─────────────────────────────────────────────────────────────────────────
# 2. DynamoDB — same table names as source (table names only need to be
#    unique within YOUR account/region, unlike S3 bucket names)
# ─────────────────────────────────────────────────────────────────────────
echo "--- 2/6 DynamoDB ---"
for SCHEMA_FILE in "$PACKAGE_DIR"/dynamodb/*.schema.json; do
  TABLE_NAME="$(python3 -c "import json; print(json.load(open('$SCHEMA_FILE'))['TableName'])" | tr -d '\r')"
  echo "  $TABLE_NAME"

  KEY_SCHEMA="$(python3 -c "import json; print(json.dumps(json.load(open('$SCHEMA_FILE'))['KeySchema']))" | tr -d '\r')"
  ATTR_DEFS="$(python3 -c "import json; print(json.dumps(json.load(open('$SCHEMA_FILE'))['AttributeDefinitions']))" | tr -d '\r')"
  GSIS="$(python3 -c "
import json
d = json.load(open('$SCHEMA_FILE'))
gsis = d.get('GlobalSecondaryIndexes', [])
out = [{'IndexName': g['IndexName'], 'KeySchema': g['KeySchema'], 'Projection': g['Projection']} for g in gsis]
print(json.dumps(out))
" | tr -d '\r')"

  if [[ "$GSIS" == "[]" ]]; then
    run "create table $TABLE_NAME" $AWS dynamodb create-table --region "$REGION" \
      --table-name "$TABLE_NAME" \
      --key-schema "$KEY_SCHEMA" \
      --attribute-definitions "$ATTR_DEFS" \
      --billing-mode PAY_PER_REQUEST || true
  else
    run "create table $TABLE_NAME (with GSIs)" $AWS dynamodb create-table --region "$REGION" \
      --table-name "$TABLE_NAME" \
      --key-schema "$KEY_SCHEMA" \
      --attribute-definitions "$ATTR_DEFS" \
      --global-secondary-indexes "$GSIS" \
      --billing-mode PAY_PER_REQUEST || true
  fi
done
echo

# ─────────────────────────────────────────────────────────────────────────
# 3. Cognito
# ─────────────────────────────────────────────────────────────────────────
echo "--- 3/6 Cognito ---"
POOL_JSON="$($AWS cognito-idp create-user-pool --region "$REGION" \
  --pool-name "MarketingAgentUserPool" \
  --username-attributes email \
  --auto-verified-attributes email \
  --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false,"PasswordHistorySize":5,"TemporaryPasswordValidityDays":7}}' \
  --schema '[{"Name":"businessId","AttributeDataType":"String","Mutable":true},{"Name":"role","AttributeDataType":"String","Mutable":true}]' \
  --output json 2>&1)" || true

if [[ $DRY_RUN -eq 1 ]]; then
  echo ">> create user pool MarketingAgentUserPool"
  echo "   [DRY RUN] (schema/policy per source export)"
  USER_POOL_ID="DRYRUN-POOL-ID"
else
  USER_POOL_ID="$(echo "$POOL_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['UserPool']['Id'])" | tr -d '\r')"
  echo "   Created user pool: $USER_POOL_ID"
fi

for GROUP in ADMIN EDITOR VIEWER SUPER_USER; do
  run "create Cognito group $GROUP" $AWS cognito-idp create-group --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" --group-name "$GROUP" || true
done

if [[ $DRY_RUN -eq 1 ]]; then
  echo ">> create app client AIMarketingAgent"
  echo "   [DRY RUN]"
  APP_CLIENT_ID="DRYRUN-CLIENT-ID"
else
  CLIENT_JSON="$($AWS cognito-idp create-user-pool-client --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --client-name "AIMarketingAgent" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
    --output json)"
  APP_CLIENT_ID="$(echo "$CLIENT_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['UserPoolClient']['ClientId'])" | tr -d '\r')"
  echo "   Created app client: $APP_CLIENT_ID"
fi
echo

# ─────────────────────────────────────────────────────────────────────────
# 4. Lambda functions
# ─────────────────────────────────────────────────────────────────────────
echo "--- 4/6 Lambda functions ---"

# Build the final env var JSON for one function: start from its exported
# config, substitute the new bucket name anywhere the old one appears, and
# overlay the required manual/secret values for social-auth-handler and
# send-email. FRONTEND_URL/META_REDIRECT_URI/LINKEDIN_REDIRECT_URI are set to
# placeholders here and patched for real in step 6, once the API Gateway and
# Amplify URLs actually exist.
build_env_json() {
  local fn_name="$1"
  python3 - "$PACKAGE_DIR/lambdas/$fn_name/config.json" "$SOURCE_BUCKET_NAME" "$BUCKET_NAME" <<'PYEOF' "${SECRET_VALUES[LINKEDIN_CLIENT_ID]:-}" "${SECRET_VALUES[LINKEDIN_CLIENT_SECRET]:-}" "${SECRET_VALUES[META_APP_ID]:-}" "${SECRET_VALUES[META_APP_SECRET]:-}" "${SECRET_VALUES[META_CONFIG_ID]:-}" "${SECRET_VALUES[SENDGRID_API_KEY]:-}"
import json, sys
cfg_path, old_bucket, new_bucket = sys.argv[1], sys.argv[2], sys.argv[3]
linkedin_id, linkedin_secret, meta_id, meta_secret, meta_config_id, sendgrid_key = sys.argv[4:10]

cfg = json.load(open(cfg_path))
env = dict(cfg.get("EnvironmentVariables") or {})

for k, v in list(env.items()):
    if isinstance(v, str) and old_bucket in v:
        env[k] = v.replace(old_bucket, new_bucket)

overrides = {
    "LINKEDIN_CLIENT_ID": linkedin_id,
    "LINKEDIN_CLIENT_SECRET": linkedin_secret,
    "META_APP_ID": meta_id,
    "META_APP_SECRET": meta_secret,
    "META_CONFIG_ID": meta_config_id,
    "SENDGRID_API_KEY": sendgrid_key,
    "FRONTEND_URL": "https://PLACEHOLDER-patched-in-step-6.example.com",
    "META_REDIRECT_URI": "https://PLACEHOLDER-patched-in-step-6.example.com/dev/social/meta/callback",
    "LINKEDIN_REDIRECT_URI": "https://PLACEHOLDER-patched-in-step-6.example.com/dev/social/linkedin/callback",
}
for k, v in overrides.items():
    if k in env and v:
        env[k] = v

print(json.dumps({"Variables": env}))
PYEOF
}

deploy_lambda() {
  local fn_name="$1"
  echo "  $fn_name"
  local dir="$PACKAGE_DIR/lambdas/$fn_name"
  local runtime handler memory timeout
  runtime="$(python3 -c "import json; print(json.load(open('$dir/config.json'))['Runtime'])" | tr -d '\r')"
  handler="$(python3 -c "import json; print(json.load(open('$dir/config.json'))['Handler'])" | tr -d '\r')"
  memory="$(python3 -c "import json; print(json.load(open('$dir/config.json'))['MemorySize'])" | tr -d '\r')"
  timeout="$(python3 -c "import json; print(json.load(open('$dir/config.json'))['Timeout'])" | tr -d '\r')"

  local env_json
  env_json="$(build_env_json "$fn_name")"

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "   [DRY RUN] create-function --function-name $fn_name --runtime $runtime --handler $handler --memory $memory --timeout $timeout --role $EXEC_ROLE_ARN --zip-file fileb://$dir/code.zip --environment '$env_json'"
    return
  fi

  if $AWS lambda get-function --function-name "$fn_name" --region "$REGION" >/dev/null 2>&1; then
    echo "   already exists - updating code + config"
    $AWS lambda update-function-code --function-name "$fn_name" --region "$REGION" \
      --zip-file "fileb://$dir/code.zip" >/dev/null
    $AWS lambda wait function-updated --function-name "$fn_name" --region "$REGION"
    $AWS lambda update-function-configuration --function-name "$fn_name" --region "$REGION" \
      --runtime "$runtime" --handler "$handler" --memory-size "$memory" --timeout "$timeout" \
      --role "$EXEC_ROLE_ARN" --environment "$env_json" >/dev/null
  else
    $AWS lambda create-function --function-name "$fn_name" --region "$REGION" \
      --runtime "$runtime" --handler "$handler" --memory-size "$memory" --timeout "$timeout" \
      --role "$EXEC_ROLE_ARN" --zip-file "fileb://$dir/code.zip" --environment "$env_json" >/dev/null
  fi
  $AWS lambda wait function-active --function-name "$fn_name" --region "$REGION" 2>/dev/null || true
}

LAMBDAS=(social-auth-handler social-publish-handler-new marketing-scheduler user-handler business-management invitation-handler generate-marketing-asset generate-caption generate-flyer get-history get_models WebsiteCrawler send-email)
for FN in "${LAMBDAS[@]}"; do
  deploy_lambda "$FN"
done
echo

# ─────────────────────────────────────────────────────────────────────────
# 5. API Gateway HTTP API
# ─────────────────────────────────────────────────────────────────────────
echo "--- 5/6 API Gateway ---"

if [[ $DRY_RUN -eq 1 ]]; then
  API_ID="DRYRUN-API-ID"
  AUTHORIZER_ID="DRYRUN-AUTH-ID"
  echo ">> create HTTP API marketing-ai-api"
  echo "   [DRY RUN]"
else
  API_JSON="$($AWS apigatewayv2 create-api --region "$REGION" \
    --name "marketing-ai-api" --protocol-type HTTP \
    --cors-configuration 'AllowOrigins=*,AllowMethods=GET,POST,OPTIONS,PUT,DELETE,PATCH,AllowHeaders=*,content-type,authorization' \
    --output json)"
  API_ID="$(echo "$API_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['ApiId'])" | tr -d '\r')"
  echo "   Created API: $API_ID"

  AUTH_JSON="$($AWS apigatewayv2 create-authorizer --region "$REGION" --api-id "$API_ID" \
    --name "cognito-jwt" --authorizer-type JWT --identity-source '$request.header.Authorization' \
    --jwt-configuration "Audience=$APP_CLIENT_ID,Issuer=https://cognito-idp.$REGION.amazonaws.com/$USER_POOL_ID" \
    --output json)"
  AUTHORIZER_ID="$(echo "$AUTH_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['AuthorizerId'])" | tr -d '\r')"
  echo "   Created authorizer: $AUTHORIZER_ID"

  $AWS apigatewayv2 create-stage --region "$REGION" --api-id "$API_ID" --stage-name dev --auto-deploy >/dev/null
fi

ACCOUNT_ID="$($AWS sts get-caller-identity --query Account --output text 2>/dev/null || echo "DRYRUN-ACCOUNT")"

# One integration per in-scope Lambda + Lambda invoke permission + every
# curated route pointing at it.
declare -A INTEGRATION_IDS
for FN in "${LAMBDAS[@]}"; do
  FN_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FN"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo ">> create integration for $FN"
    echo "   [DRY RUN]"
    INTEGRATION_IDS["$FN"]="DRYRUN-INTEG-$FN"
  else
    INTEG_JSON="$($AWS apigatewayv2 create-integration --region "$REGION" --api-id "$API_ID" \
      --integration-type AWS_PROXY --integration-uri "$FN_ARN" \
      --payload-format-version 2.0 --timeout-in-millis 30000 --output json)"
    INTEG_ID="$(echo "$INTEG_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['IntegrationId'])" | tr -d '\r')"
    INTEGRATION_IDS["$FN"]="$INTEG_ID"

    $AWS lambda add-permission --region "$REGION" --function-name "$FN" \
      --statement-id "apigw-invoke-$API_ID" --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*" >/dev/null 2>&1 || true
  fi
done

python3 -c "
import json
routes = json.load(open('$PACKAGE_DIR/api-gateway/routes-to-recreate.json'))
print(len(routes), 'routes to create')
"
while IFS=$'\t' read -r ROUTE_KEY AUTH_TYPE TARGET_FN; do
  # Strip a stray trailing \r (python3's stdout is text-mode-translated to
  # CRLF on Windows even through process substitution) - without this,
  # TARGET_FN silently fails to match the INTEGRATION_IDS array key below.
  TARGET_FN="${TARGET_FN%$'\r'}"
  [[ -z "$ROUTE_KEY" ]] && continue
  INTEG_ID="${INTEGRATION_IDS[$TARGET_FN]:-}"
  if [[ -z "$INTEG_ID" ]]; then
    echo "   WARNING: no integration for $TARGET_FN, skipping route $ROUTE_KEY"
    continue
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "   [DRY RUN] create-route $ROUTE_KEY -> $TARGET_FN (auth=$AUTH_TYPE)"
  else
    AUTH_ARGS=()
    if [[ "$AUTH_TYPE" == "JWT" ]]; then
      AUTH_ARGS=(--authorization-type JWT --authorizer-id "$AUTHORIZER_ID")
    else
      AUTH_ARGS=(--authorization-type NONE)
    fi
    $AWS apigatewayv2 create-route --region "$REGION" --api-id "$API_ID" \
      --route-key "$ROUTE_KEY" --target "integrations/$INTEG_ID" "${AUTH_ARGS[@]}" >/dev/null
  fi
done < <(python3 -c "
import json
routes = json.load(open('$PACKAGE_DIR/api-gateway/routes-to-recreate.json'))
for r in routes:
    print(f\"{r['routeKey']}\t{r['authorizationType']}\t{r['targetFunctionName']}\")
")
echo

API_INVOKE_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/dev"

# ─────────────────────────────────────────────────────────────────────────
# 6. Amplify
# ─────────────────────────────────────────────────────────────────────────
echo "--- 6/6 Amplify ---"
if [[ $DRY_RUN -eq 1 ]]; then
  echo ">> create Amplify app pointed at $GITHUB_REPO"
  echo "   [DRY RUN]"
  AMPLIFY_DOMAIN="DRYRUN-APPID.amplifyapp.com"
else
  AMPLIFY_JSON="$($AWS amplify create-app --region "$AMPLIFY_REGION" \
    --name "AI_Marketing_Agent" \
    --repository "$GITHUB_REPO" \
    --access-token "$GITHUB_TOKEN" \
    --output json)"
  AMPLIFY_APP_ID="$(echo "$AMPLIFY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['app']['appId'])" | tr -d '\r')"
  AMPLIFY_DOMAIN="$(echo "$AMPLIFY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['app']['defaultDomain'])" | tr -d '\r')"

  $AWS amplify create-branch --region "$AMPLIFY_REGION" --app-id "$AMPLIFY_APP_ID" \
    --branch-name master --enable-auto-build --stage PRODUCTION >/dev/null

  echo "   Created Amplify app: $AMPLIFY_APP_ID (https://master.$AMPLIFY_DOMAIN)"
fi
echo

# ─────────────────────────────────────────────────────────────────────────
# 7. Patch social-auth-handler now that real URLs exist
# ─────────────────────────────────────────────────────────────────────────
echo "--- Patching social-auth-handler with real URLs ---"
FRONTEND_URL="https://master.${AMPLIFY_DOMAIN}"
META_REDIRECT_URI="${API_INVOKE_URL}/social/meta/callback"
LINKEDIN_REDIRECT_URI="${API_INVOKE_URL}/social/linkedin/callback"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "   [DRY RUN] update-function-configuration social-auth-handler"
  echo "     FRONTEND_URL=$FRONTEND_URL"
  echo "     META_REDIRECT_URI=$META_REDIRECT_URI"
  echo "     LINKEDIN_REDIRECT_URI=$LINKEDIN_REDIRECT_URI"
else
  CURRENT_ENV="$($AWS lambda get-function-configuration --function-name social-auth-handler --region "$REGION" --query 'Environment.Variables' --output json)"
  PATCHED_ENV="$(python3 -c "
import json
env = json.loads('''$CURRENT_ENV''')
env['FRONTEND_URL'] = '$FRONTEND_URL'
env['META_REDIRECT_URI'] = '$META_REDIRECT_URI'
env['LINKEDIN_REDIRECT_URI'] = '$LINKEDIN_REDIRECT_URI'
print(json.dumps({'Variables': env}))
" | tr -d '\r')"
  $AWS lambda update-function-configuration --function-name social-auth-handler --region "$REGION" \
    --environment "$PATCHED_ENV" >/dev/null
  $AWS lambda wait function-updated --function-name social-auth-handler --region "$REGION"
fi
echo

echo "=== Done ==="
echo
if [[ $DRY_RUN -eq 1 ]]; then
  echo "This was a DRY RUN. Nothing was created. Re-run without --dry-run once"
  echo "the plan above looks right and your IAM role exists."
else
  echo "New resources created in this account:"
  echo "  S3 bucket:       $BUCKET_NAME"
  echo "  Cognito pool:    $USER_POOL_ID"
  echo "  Cognito client:  $APP_CLIENT_ID"
  echo "  API Gateway:     $API_ID  ($API_INVOKE_URL)"
  echo "  Amplify app:     https://master.$AMPLIFY_DOMAIN"
  echo
  echo "IMPORTANT — Meta and LinkedIn OAuth apps must have these exact redirect"
  echo "URIs registered on their developer portals, or connecting accounts will fail:"
  echo "  $META_REDIRECT_URI"
  echo "  $LINKEDIN_REDIRECT_URI"
  echo
  echo "The frontend source still points at the OLD API URL — you need to edit"
  echo "src/services/api.ts to point at $API_INVOKE_URL and push before Amplify"
  echo "will serve a working app. See SETUP_GUIDE.md."
fi

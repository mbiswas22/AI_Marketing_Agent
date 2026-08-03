#!/usr/bin/env bash
#
# recreate-same-account.sh — Rebuilds every AWS resource behind the AI
# Marketing Hub, IN THE SAME AWS ACCOUNT you just deleted them from, using
# the CURRENT lambda/ source in this repo (not a stale export).
#
# Unlike migration/create-destination.sh (which targets a NEW account/team
# and deliberately avoids IAM and reusing names/secrets), this script:
#   - reuses the exact same S3 bucket name, DynamoDB table names, and Lambda
#     function names (safe because the old ones are gone from this account)
#   - creates the IAM roles the Lambdas need (create-destination.sh requires
#     you to bring your own)
#   - expects your REAL, still-valid LinkedIn/Meta/SendGrid/Make.com
#     credentials in --secrets-file (there's no new team to register new
#     developer apps for)
#   - zips Lambda code fresh from lambda/*/ in this working tree
#
# It CANNOT preserve the Cognito user pool ID or the API Gateway's
# auto-generated ID — AWS assigns new ones even with identical names. After
# a real run, this script rewrites src/aws-config.ts and
# src/services/api.ts with the new values. Review the diff, commit, push.
#
# Use --dry-run first: it prints every AWS CLI command it would run without
# executing any of them.
#
# Usage:
#   ./recreate-same-account.sh \
#     --secrets-file ./secrets.env \
#     --github-token <github-pat> \
#     [--github-repo https://github.com/mbiswas22/AI_Marketing_Agent] \
#     [--github-branch master] \
#     [--profile default] [--region us-east-2] [--amplify-region us-east-1] \
#     [--dry-run]
#
# secrets.env format (KEY=VALUE per line):
#   LINKEDIN_CLIENT_ID=...
#   LINKEDIN_CLIENT_SECRET=...
#   META_APP_ID=...
#   META_APP_SECRET=...
#   META_CONFIG_ID=...
#   SENDGRID_API_KEY=...
#   MAKE_WEBHOOK_URL=...
#   MAKE_WEBHOOK_SECRET=...
#   FROM_EMAIL=...            (optional, defaults to noreply@example.com)

set -euo pipefail

PROFILE="default"
REGION="us-east-2"
AMPLIFY_REGION="us-east-1"
SECRETS_FILE=""
GITHUB_TOKEN=""
GITHUB_REPO="https://github.com/mbiswas22/AI_Marketing_Agent"
GITHUB_BRANCH="master"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --secrets-file) SECRETS_FILE="$2"; shift 2 ;;
    --github-token) GITHUB_TOKEN="$2"; shift 2 ;;
    --github-repo) GITHUB_REPO="$2"; shift 2 ;;
    --github-branch) GITHUB_BRANCH="$2"; shift 2 ;;
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
[[ -z "$SECRETS_FILE" ]] && { echo "ERROR: --secrets-file is required."; FAIL=1; }
[[ -z "$GITHUB_TOKEN" ]] && { echo "ERROR: --github-token is required to connect Amplify to the repo."; FAIL=1; }
if [[ $FAIL -eq 1 ]]; then
  echo
  echo "Aborting - fix the above and re-run. Nothing was created."
  exit 1
fi

command -v aws >/dev/null 2>&1 || { echo "aws CLI not found on PATH."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found on PATH."; exit 1; }
if [[ $DRY_RUN -eq 0 ]]; then
  command -v zip >/dev/null 2>&1 || { echo "zip not found on PATH (Git Bash: pacman -S zip, or install via choco)."; exit 1; }
fi

AWS="aws --profile $PROFILE"

# Repo root — this script lives in migration/, resources it touches (lambda/,
# src/) are one level up.
SCRIPT_DIR="$(python3 -c "import os,sys; print(os.path.dirname(os.path.abspath(sys.argv[1])).replace(chr(92),'/'))" "$0")"
REPO_ROOT="$(python3 -c "import os,sys; print(os.path.dirname(sys.argv[1]))" "$SCRIPT_DIR")"

REQUIRED_SECRETS=(LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET META_APP_ID META_APP_SECRET META_CONFIG_ID SENDGRID_API_KEY MAKE_WEBHOOK_URL MAKE_WEBHOOK_SECRET)
OPTIONAL_SECRETS=(FROM_EMAIL)
PLACEHOLDER_VALUE="REPLACE_ME"

# The secrets file is never overwritten. If it doesn't exist, it's created
# fresh with placeholders for every key. If it already exists, existing
# KEY=VALUE lines are left completely untouched — only keys that are
# genuinely absent from the file get a placeholder line appended. This way
# a secrets.env you've already filled in (partially or fully) is always
# safe to point this script at again.
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "No secrets file at '$SECRETS_FILE' — creating one with placeholders."
  {
    for K in "${REQUIRED_SECRETS[@]}" "${OPTIONAL_SECRETS[@]}"; do
      echo "$K=$PLACEHOLDER_VALUE"
    done
  } > "$SECRETS_FILE"
  echo "Fill in real values in '$SECRETS_FILE' and re-run. Nothing was created."
  exit 1
fi

declare -A SECRET_VALUES
while IFS='=' read -r K V; do
  [[ -z "$K" || "$K" == \#* ]] && continue
  SECRET_VALUES["$K"]="$V"
done < "$SECRETS_FILE"

APPENDED=()
for K in "${REQUIRED_SECRETS[@]}" "${OPTIONAL_SECRETS[@]}"; do
  if [[ -z "${SECRET_VALUES[$K]+set}" ]]; then
    echo "$K=$PLACEHOLDER_VALUE" >> "$SECRETS_FILE"
    SECRET_VALUES["$K"]="$PLACEHOLDER_VALUE"
    APPENDED+=("$K")
  fi
done
if [[ ${#APPENDED[@]} -gt 0 ]]; then
  echo "Added placeholder(s) for previously-missing key(s) to '$SECRETS_FILE' (existing keys untouched):"
  for K in "${APPENDED[@]}"; do echo "  - $K"; done
fi

MISSING=()
for K in "${REQUIRED_SECRETS[@]}"; do
  V="${SECRET_VALUES[$K]:-}"
  [[ -z "$V" || "$V" == "$PLACEHOLDER_VALUE" ]] && MISSING+=("$K")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: '$SECRETS_FILE' still has placeholder or empty values for:"
  for K in "${MISSING[@]}"; do echo "  - $K"; done
  echo
  echo "Fill in real values (don't remove other keys) and re-run. Nothing was created."
  exit 1
fi

BUCKET_NAME="kushtest-marketing-ai-assets"
FRONTEND_TABLE_USER="user"

echo "=== AI Marketing Hub — same-account recreate ==="
echo "Repo root: $REPO_ROOT"
echo "Profile:   $PROFILE"
echo "Region:    $REGION (Amplify: $AMPLIFY_REGION)"
echo "Bucket:    $BUCKET_NAME"
echo "GitHub:    $GITHUB_REPO @ $GITHUB_BRANCH"
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
run() {
  local desc="$1"; shift
  echo ">> $desc"
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '   [DRY RUN] %q ' "$@"; echo
  else
    "$@"
  fi
}

# Same reasoning as migration/create-destination.sh: a plain subfolder of cwd,
# resolved through python, behaves consistently across bash/python/aws.exe on
# Windows+Git Bash, unlike mktemp/`/tmp`.
TMP_DIR="$(python3 -c "import os; print(os.getcwd().replace(chr(92), '/'))")/.recreate-same-account-tmp"
mkdir -p "$TMP_DIR"
cleanup_tmp_dir() { rm -rf "$TMP_DIR"; }
trap cleanup_tmp_dir EXIT

ACCOUNT_ID="$($AWS sts get-caller-identity --query Account --output text 2>/dev/null || echo "DRYRUN-ACCOUNT")"

# ─────────────────────────────────────────────────────────────────────────
# 1. IAM — Lambda execution role + EventBridge Scheduler invoke role
# ─────────────────────────────────────────────────────────────────────────
echo "--- 1/7 IAM ---"

EXEC_ROLE_NAME="marketing-app-lambda-role"
SCHEDULER_INVOKE_ROLE_NAME="marketing-scheduler-invoke-role"
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${EXEC_ROLE_NAME}"
SCHEDULER_INVOKE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${SCHEDULER_INVOKE_ROLE_NAME}"

LAMBDA_TRUST_POLICY="$TMP_DIR/lambda-trust-policy.json"
cat > "$LAMBDA_TRUST_POLICY" <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

SCHEDULER_TRUST_POLICY="$TMP_DIR/scheduler-trust-policy.json"
cat > "$SCHEDULER_TRUST_POLICY" <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

DYNAMO_TABLES=(Business user Channel ContentType Model invitation ContentSchedules ScheduleLogs social-connections kushtest-MarketingActions AIMarketingHistory Artifact AuditEvent Job)
DYNAMO_TABLES_STR="${DYNAMO_TABLES[*]}"
DYNAMO_TABLE_ARNS="$(python3 -c "
import json
region, acct = '$REGION', '$ACCOUNT_ID'
tables = '''$DYNAMO_TABLES_STR'''.split()
arns = []
for t in tables:
    arns.append(f'arn:aws:dynamodb:{region}:{acct}:table/{t}')
    arns.append(f'arn:aws:dynamodb:{region}:{acct}:table/{t}/index/*')
print(json.dumps(arns))
")"

EXEC_ROLE_POLICY="$TMP_DIR/exec-role-policy.json"
python3 -c "
import json
policy = {
  'Version': '2012-10-17',
  'Statement': [
    {'Sid': 'DynamoDBAccess', 'Effect': 'Allow',
     'Action': ['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:DeleteItem','dynamodb:Query','dynamodb:Scan'],
     'Resource': $DYNAMO_TABLE_ARNS},
    {'Sid': 'S3Access', 'Effect': 'Allow',
     'Action': ['s3:GetObject','s3:PutObject'],
     'Resource': 'arn:aws:s3:::$BUCKET_NAME/*'},
    {'Sid': 'BedrockInvokeUsEast1', 'Effect': 'Allow',
     'Action': ['bedrock:InvokeModel','bedrock:Converse'],
     'Resource': ['arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0','arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0','arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0','arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0']},
    {'Sid': 'BedrockInvokeUsWest2', 'Effect': 'Allow',
     'Action': ['bedrock:InvokeModel'],
     'Resource': 'arn:aws:bedrock:us-west-2::foundation-model/stability.stable-image-ultra-v1:1'},
    {'Sid': 'BedrockListModels', 'Effect': 'Allow',
     'Action': ['bedrock:ListFoundationModels'],
     'Resource': '*'},
    {'Sid': 'SchedulerManage', 'Effect': 'Allow',
     'Action': ['scheduler:CreateSchedule','scheduler:UpdateSchedule','scheduler:DeleteSchedule','scheduler:GetSchedule'],
     'Resource': 'arn:aws:scheduler:$REGION:$ACCOUNT_ID:schedule/*'},
    {'Sid': 'InvokeDownstreamLambdas', 'Effect': 'Allow',
     'Action': ['lambda:InvokeFunction'],
     'Resource': ['arn:aws:lambda:$REGION:$ACCOUNT_ID:function:generate-marketing-asset','arn:aws:lambda:$REGION:$ACCOUNT_ID:function:social-publish-handler-new']},
    {'Sid': 'PassSchedulerInvokeRole', 'Effect': 'Allow',
     'Action': ['iam:PassRole'],
     'Resource': '$SCHEDULER_INVOKE_ROLE_ARN'}
  ]
}
with open('$EXEC_ROLE_POLICY', 'w') as f:
    json.dump(policy, f)
"

SCHEDULER_INVOKE_POLICY="$TMP_DIR/scheduler-invoke-policy.json"
cat > "$SCHEDULER_INVOKE_POLICY" <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"lambda:InvokeFunction","Resource":"arn:aws:lambda:$REGION:$ACCOUNT_ID:function:marketing-scheduler"}]}
EOF

if [[ $DRY_RUN -eq 1 ]]; then
  echo ">> create IAM role $EXEC_ROLE_NAME + attach AWSLambdaBasicExecutionRole + inline policy"
  echo "   [DRY RUN]"
  echo ">> create IAM role $SCHEDULER_INVOKE_ROLE_NAME + inline policy"
  echo "   [DRY RUN]"
else
  $AWS iam create-role --role-name "$EXEC_ROLE_NAME" \
    --assume-role-policy-document "file://$LAMBDA_TRUST_POLICY" >/dev/null
  $AWS iam attach-role-policy --role-name "$EXEC_ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  $AWS iam put-role-policy --role-name "$EXEC_ROLE_NAME" \
    --policy-name "marketing-app-inline-policy" \
    --policy-document "file://$EXEC_ROLE_POLICY"

  $AWS iam create-role --role-name "$SCHEDULER_INVOKE_ROLE_NAME" \
    --assume-role-policy-document "file://$SCHEDULER_TRUST_POLICY" >/dev/null
  $AWS iam put-role-policy --role-name "$SCHEDULER_INVOKE_ROLE_NAME" \
    --policy-name "scheduler-invoke-inline-policy" \
    --policy-document "file://$SCHEDULER_INVOKE_POLICY"

  echo "   Created roles: $EXEC_ROLE_NAME, $SCHEDULER_INVOKE_ROLE_NAME"
  echo "   Waiting 15s for IAM propagation before creating Lambdas..."
  sleep 15
fi
echo

# ─────────────────────────────────────────────────────────────────────────
# 2. S3
# ─────────────────────────────────────────────────────────────────────────
echo "--- 2/7 S3 ---"
if [[ "$REGION" == "us-east-1" ]]; then
  run "create bucket $BUCKET_NAME" $AWS s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
else
  run "create bucket $BUCKET_NAME" $AWS s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION"
fi

CORS_FILE="$TMP_DIR/cors.json"
cat > "$CORS_FILE" <<'EOF'
{"CORSRules":[{"AllowedOrigins":["http://localhost:5173","https://*.amplifyapp.com"],"AllowedMethods":["GET","PUT","POST","DELETE","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":3000}]}
EOF
run "apply CORS to $BUCKET_NAME" $AWS s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration "file://$CORS_FILE"
run "block public access on $BUCKET_NAME" $AWS s3api put-public-access-block --bucket "$BUCKET_NAME" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo

# ─────────────────────────────────────────────────────────────────────────
# 3. DynamoDB — 14 tables, PAY_PER_REQUEST, schemas per migration/INVENTORY.md
# ─────────────────────────────────────────────────────────────────────────
echo "--- 3/7 DynamoDB ---"

create_table() {
  local name="$1" key_schema="$2" attr_defs="$3" gsis="${4:-}"
  echo "  $name"
  if [[ -z "$gsis" ]]; then
    run "create table $name" $AWS dynamodb create-table --region "$REGION" \
      --table-name "$name" --key-schema "$key_schema" --attribute-definitions "$attr_defs" \
      --billing-mode PAY_PER_REQUEST
  else
    run "create table $name (with GSIs)" $AWS dynamodb create-table --region "$REGION" \
      --table-name "$name" --key-schema "$key_schema" --attribute-definitions "$attr_defs" \
      --global-secondary-indexes "$gsis" --billing-mode PAY_PER_REQUEST
  fi
}

create_table "Business" \
  '[{"AttributeName":"businessId","KeyType":"HASH"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"}]'

create_table "user" \
  '[{"AttributeName":"businessId","KeyType":"HASH"},{"AttributeName":"userId","KeyType":"RANGE"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"userId","AttributeType":"S"}]' \
  '[{"IndexName":"userId-index","KeySchema":[{"AttributeName":"userId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'

create_table "Channel" \
  '[{"AttributeName":"businessId","KeyType":"HASH"},{"AttributeName":"channelName","KeyType":"RANGE"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"channelName","AttributeType":"S"}]'

create_table "ContentType" \
  '[{"AttributeName":"businessId","KeyType":"HASH"},{"AttributeName":"contentTypeName","KeyType":"RANGE"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"contentTypeName","AttributeType":"S"}]'

create_table "Model" \
  '[{"AttributeName":"businessId","KeyType":"HASH"},{"AttributeName":"modelName","KeyType":"RANGE"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"modelName","AttributeType":"S"}]'

create_table "invitation" \
  '[{"AttributeName":"invitationId","KeyType":"HASH"}]' \
  '[{"AttributeName":"invitationId","AttributeType":"S"}]'

create_table "ContentSchedules" \
  '[{"AttributeName":"schedule_id","KeyType":"HASH"}]' \
  '[{"AttributeName":"schedule_id","AttributeType":"S"},{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"user_id","AttributeType":"S"}]' \
  '[{"IndexName":"businessId-index","KeySchema":[{"AttributeName":"businessId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"user_id-index","KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'

create_table "ScheduleLogs" \
  '[{"AttributeName":"log_id","KeyType":"HASH"}]' \
  '[{"AttributeName":"log_id","AttributeType":"S"},{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"user_id","AttributeType":"S"}]' \
  '[{"IndexName":"businessId-index","KeySchema":[{"AttributeName":"businessId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"user_id-index","KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'

create_table "social-connections" \
  '[{"AttributeName":"businessId","KeyType":"HASH"},{"AttributeName":"platform","KeyType":"RANGE"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"platform","AttributeType":"S"}]'

create_table "kushtest-MarketingActions" \
  '[{"AttributeName":"action_id","KeyType":"HASH"}]' \
  '[{"AttributeName":"action_id","AttributeType":"S"}]'

create_table "AIMarketingHistory" \
  '[{"AttributeName":"userId","KeyType":"HASH"},{"AttributeName":"createdAt","KeyType":"RANGE"}]' \
  '[{"AttributeName":"userId","AttributeType":"S"},{"AttributeName":"createdAt","AttributeType":"S"}]'

create_table "Artifact" \
  '[{"AttributeName":"jobId","KeyType":"HASH"},{"AttributeName":"artifactId","KeyType":"RANGE"}]' \
  '[{"AttributeName":"jobId","AttributeType":"S"},{"AttributeName":"artifactId","AttributeType":"S"}]'

create_table "AuditEvent" \
  '[{"AttributeName":"eventId","KeyType":"HASH"}]' \
  '[{"AttributeName":"eventId","AttributeType":"S"}]'

create_table "Job" \
  '[{"AttributeName":"businessId","KeyType":"HASH"},{"AttributeName":"jobId","KeyType":"RANGE"}]' \
  '[{"AttributeName":"businessId","AttributeType":"S"},{"AttributeName":"jobId","AttributeType":"S"}]'
echo

# ─────────────────────────────────────────────────────────────────────────
# 4. Cognito
# ─────────────────────────────────────────────────────────────────────────
echo "--- 4/7 Cognito ---"
if [[ $DRY_RUN -eq 1 ]]; then
  echo ">> create user pool MarketingAgentUserPool"
  echo "   [DRY RUN]"
  USER_POOL_ID="DRYRUN-POOL-ID"
  APP_CLIENT_ID="DRYRUN-CLIENT-ID"
else
  POOL_JSON="$($AWS cognito-idp create-user-pool --region "$REGION" \
    --pool-name "MarketingAgentUserPool" \
    --username-attributes email \
    --auto-verified-attributes email \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false,"PasswordHistorySize":5,"TemporaryPasswordValidityDays":7}}' \
    --schema '[{"Name":"businessId","AttributeDataType":"String","Mutable":true},{"Name":"role","AttributeDataType":"String","Mutable":true}]' \
    --output json)"
  USER_POOL_ID="$(echo "$POOL_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['UserPool']['Id'])" | tr -d '\r')"
  echo "   Created user pool: $USER_POOL_ID"

  for GROUP in ADMIN EDITOR VIEWER SUPER_USER; do
    $AWS cognito-idp create-group --region "$REGION" \
      --user-pool-id "$USER_POOL_ID" --group-name "$GROUP" >/dev/null
  done

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
# 5. Lambda functions — zipped fresh from current lambda/ source
# ─────────────────────────────────────────────────────────────────────────
echo "--- 5/7 Lambda functions ---"

# name | source_dir (relative to REPO_ROOT) | runtime | memory | timeout | env_json_template
# env_json_template uses __BUCKET__ / __ACCOUNT__ / __REGION__ placeholders,
# substituted below; secret values are overlaid separately.
build_env_json() {
  local envs="$1"  # space-separated KEY=VALUE, values may reference secrets via $SECRET:NAME
  python3 -c "
import json, sys
pairs = '''$envs'''.split('\x1f')
env = {}
for p in pairs:
    if not p:
        continue
    k, v = p.split('=', 1)
    env[k] = v
print(json.dumps({'Variables': env}))
"
}

zip_lambda() {
  local src_dir="$1" zip_path="$2" rename_from="$3"
  rm -f "$zip_path"
  local stage_dir="$TMP_DIR/stage-$(basename "$zip_path" .zip)"
  rm -rf "$stage_dir"
  mkdir -p "$stage_dir"
  cp -r "$src_dir"/. "$stage_dir"/
  rm -rf "$stage_dir/__pycache__"
  if [[ -n "$rename_from" && -f "$stage_dir/$rename_from" ]]; then
    mv "$stage_dir/$rename_from" "$stage_dir/lambda_function.py"
  fi
  ( cd "$stage_dir" && zip -rq "$zip_path" . )
}

deploy_lambda() {
  local fn_name="$1" src_dir="$2" runtime="$3" memory="$4" timeout="$5" env_json="$6" rename_from="${7:-}"
  echo "  $fn_name"
  local zip_path="$TMP_DIR/$fn_name.zip"

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "   [DRY RUN] zip $src_dir -> $zip_path, then create-function --function-name $fn_name --runtime $runtime --memory $memory --timeout $timeout --role $EXEC_ROLE_ARN --environment '$env_json'"
    return
  fi

  zip_lambda "$REPO_ROOT/$src_dir" "$zip_path" "$rename_from"

  $AWS lambda create-function --function-name "$fn_name" --region "$REGION" \
    --runtime "$runtime" --handler "lambda_function.lambda_handler" \
    --memory-size "$memory" --timeout "$timeout" \
    --role "$EXEC_ROLE_ARN" --zip-file "fileb://$zip_path" --environment "$env_json" >/dev/null
  $AWS lambda wait function-active --function-name "$fn_name" --region "$REGION" 2>/dev/null || true
}

# Placeholder redirect/frontend URLs — real values patched in step 7.
PLACEHOLDER="https://PLACEHOLDER-patched-in-step-7.example.com"

L=$'\x1f'  # env-pair separator for build_env_json

deploy_lambda "social-auth-handler" "lambda/social-auth-handler" python3.12 128 30 \
  "$(build_env_json "FRONTEND_URL=$PLACEHOLDER${L}META_REDIRECT_URI=$PLACEHOLDER/social/meta/callback${L}LINKEDIN_REDIRECT_URI=$PLACEHOLDER/social/linkedin/callback${L}LINKEDIN_CLIENT_ID=${SECRET_VALUES[LINKEDIN_CLIENT_ID]}${L}LINKEDIN_CLIENT_SECRET=${SECRET_VALUES[LINKEDIN_CLIENT_SECRET]}${L}META_APP_ID=${SECRET_VALUES[META_APP_ID]}${L}META_APP_SECRET=${SECRET_VALUES[META_APP_SECRET]}${L}META_CONFIG_ID=${SECRET_VALUES[META_CONFIG_ID]}")"

deploy_lambda "social-publish-handler-new" "lambda/social-publish-handler-new" python3.12 128 30 \
  "$(build_env_json "S3_BUCKET_NAME=$BUCKET_NAME${L}MAKE_WEBHOOK_URL=${SECRET_VALUES[MAKE_WEBHOOK_URL]}${L}MAKE_WEBHOOK_SECRET=${SECRET_VALUES[MAKE_WEBHOOK_SECRET]}")"

deploy_lambda "marketing-scheduler" "lambda/marketing-scheduler" python3.12 256 60 \
  "$(build_env_json "")"

deploy_lambda "user-handler" "lambda/User-Handler" python3.12 128 3 \
  "$(build_env_json "USER_TABLE=user")"

deploy_lambda "business-management" "lambda/businessManagement" python3.12 128 3 \
  "$(build_env_json "CHANNEL_TABLE=Channel${L}USER_TABLE=user${L}BUSINESS_TABLE=Business${L}MODEL_TABLE=Model${L}CONTENT_TYPE_TABLE=ContentType")" \
  "lambda-function.py"

deploy_lambda "invitation-handler" "lambda/Invitation-handler" python3.12 128 30 \
  "$(build_env_json "")" \
  "lambda-function.py"

deploy_lambda "generate-marketing-asset" "lambda/generate-marketing-asset" python3.12 512 60 \
  "$(build_env_json "S3_BUCKET=$BUCKET_NAME${L}DYNAMO_TABLE=kushtest-MarketingActions")"

deploy_lambda "generate-caption" "lambda/generate_caption" python3.12 256 30 \
  "$(build_env_json "S3_BUCKET=$BUCKET_NAME${L}DYNAMO_TABLE=kushtest-MarketingActions${L}TEXT_MODEL=us.amazon.nova-micro-v1:0")"

deploy_lambda "get-history" "lambda/get_history" python3.12 128 3 \
  "$(build_env_json "S3_BUCKET=$BUCKET_NAME${L}DYNAMO_TABLE=kushtest-MarketingActions")"

deploy_lambda "get_models" "lambda/get_models" python3.12 128 3 \
  "$(build_env_json "")"

deploy_lambda "WebsiteCrawler" "lambda/website-crawler" python3.14 256 60 \
  "$(build_env_json "DYNAMO_TABLE=kushtest-MarketingActions${L}S3_BUCKET=$BUCKET_NAME")"

FROM_EMAIL_VALUE="${SECRET_VALUES[FROM_EMAIL]:-}"
[[ -z "$FROM_EMAIL_VALUE" || "$FROM_EMAIL_VALUE" == "$PLACEHOLDER_VALUE" ]] && FROM_EMAIL_VALUE="noreply@example.com"
deploy_lambda "send-email" "lambda/send-email" python3.12 128 3 \
  "$(build_env_json "SENDGRID_API_KEY=${SECRET_VALUES[SENDGRID_API_KEY]}${L}DYNAMO_TABLE=kushtest-MarketingActions${L}FROM_EMAIL=$FROM_EMAIL_VALUE")"

# generate-flyer's source isn't committed to this repo (only its code.zip is,
# inside the captured migration package) — deploy from that zip directly
# instead of zipping from lambda/.
FLYER_PACKAGE="$REPO_ROOT/migration/migration-package-20260720T172246Z/lambdas/generate-flyer/code.zip"
echo "  generate-flyer"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "   [DRY RUN] create-function --function-name generate-flyer --zip-file fileb://$FLYER_PACKAGE"
else
  if [[ ! -f "$FLYER_PACKAGE" ]]; then
    echo "   ERROR: $FLYER_PACKAGE not found — generate-flyer source isn't in lambda/, and this captured package is the only known copy. Skipping."
  else
    ENV_JSON="$(build_env_json "S3_BUCKET=$BUCKET_NAME${L}DYNAMO_TABLE=kushtest-MarketingActions")"
    $AWS lambda create-function --function-name "generate-flyer" --region "$REGION" \
      --runtime python3.12 --handler "lambda_function.lambda_handler" \
      --memory-size 128 --timeout 30 \
      --role "$EXEC_ROLE_ARN" --zip-file "fileb://$FLYER_PACKAGE" --environment "$ENV_JSON" >/dev/null
    $AWS lambda wait function-active --function-name "generate-flyer" --region "$REGION" 2>/dev/null || true
  fi
fi

LAMBDAS=(social-auth-handler social-publish-handler-new marketing-scheduler user-handler business-management invitation-handler generate-marketing-asset generate-caption generate-flyer get-history get_models WebsiteCrawler send-email)
echo

# ─────────────────────────────────────────────────────────────────────────
# 6. API Gateway HTTP API
# ─────────────────────────────────────────────────────────────────────────
echo "--- 6/7 API Gateway ---"

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

# Curated real routes (excludes the /social-v2/... test duplicates) —
# same list as migration/migration-package-*/api-gateway/routes-to-recreate.json.
ROUTES_FILE="$TMP_DIR/routes.tsv"
cat > "$ROUTES_FILE" <<'EOF'
DELETE /business/{businessId}	JWT	business-management
DELETE /social/connections/facebook	JWT	social-auth-handler
DELETE /social/connections/instagram	JWT	social-auth-handler
DELETE /social/connections/{platform}	JWT	social-auth-handler
DELETE /users/{userId}	JWT	user-handler
GET /business	JWT	business-management
GET /history	JWT	get-history
GET /invitations	JWT	invitation-handler
GET /invitations/{invitationId}	JWT	invitation-handler
GET /models	NONE	get_models
GET /social/connections	JWT	social-auth-handler
GET /social/linkedin/authorize	JWT	social-auth-handler
GET /social/linkedin/callback	NONE	social-auth-handler
GET /social/meta/authorize	JWT	social-auth-handler
GET /social/meta/callback	NONE	social-auth-handler
GET /social/meta/instagram	JWT	social-auth-handler
GET /social/meta/pages	JWT	social-auth-handler
GET /users	JWT	user-handler
GET /users/{userId}	JWT	user-handler
POST /business	JWT	business-management
POST /crawl	NONE	WebsiteCrawler
POST /flyer	NONE	generate-flyer
POST /generate	JWT	generate-caption
POST /image	JWT	generate-marketing-asset
POST /invitations	JWT	invitation-handler
POST /schedule	JWT	marketing-scheduler
POST /send-email	JWT	send-email
POST /social/linkedin/publish	JWT	social-publish-handler-new
POST /social/meta/instagram/publish	JWT	social-publish-handler-new
POST /social/meta/publish	JWT	social-publish-handler-new
POST /users	JWT	user-handler
PUT /business/{businessId}	JWT	business-management
PUT /invitations/{invitationId}	JWT	invitation-handler
PUT /users/{userId}	JWT	user-handler
EOF

echo "  $(wc -l < "$ROUTES_FILE") routes to create"
while IFS=$'\t' read -r ROUTE_KEY AUTH_TYPE TARGET_FN; do
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
done < "$ROUTES_FILE"
echo

API_INVOKE_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/dev"

# ─────────────────────────────────────────────────────────────────────────
# 7. Amplify + patch social-auth-handler + patch frontend source
# ─────────────────────────────────────────────────────────────────────────
echo "--- 7/7 Amplify + patching ---"
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
    --branch-name "$GITHUB_BRANCH" --enable-auto-build --stage PRODUCTION >/dev/null

  echo "   Created Amplify app: $AMPLIFY_APP_ID (https://$GITHUB_BRANCH.$AMPLIFY_DOMAIN)"
fi

FRONTEND_URL="https://$GITHUB_BRANCH.${AMPLIFY_DOMAIN}"
META_REDIRECT_URI="${API_INVOKE_URL}/social/meta/callback"
LINKEDIN_REDIRECT_URI="${API_INVOKE_URL}/social/linkedin/callback"

echo "Patching social-auth-handler with real URLs..."
if [[ $DRY_RUN -eq 1 ]]; then
  echo "   [DRY RUN] update-function-configuration social-auth-handler"
  echo "     FRONTEND_URL=$FRONTEND_URL"
  echo "     META_REDIRECT_URI=$META_REDIRECT_URI"
  echo "     LINKEDIN_REDIRECT_URI=$LINKEDIN_REDIRECT_URI"
else
  CURRENT_ENV_FILE="$TMP_DIR/current-env.json"
  $AWS lambda get-function-configuration --function-name social-auth-handler --region "$REGION" \
    --query 'Environment.Variables' --output json > "$CURRENT_ENV_FILE"

  PATCHED_ENV_FILE="$TMP_DIR/patched-env.json"
  python3 - "$CURRENT_ENV_FILE" "$FRONTEND_URL" "$META_REDIRECT_URI" "$LINKEDIN_REDIRECT_URI" "$PATCHED_ENV_FILE" <<'PYEOF'
import json, sys
env_path, frontend_url, meta_uri, linkedin_uri, out_path = sys.argv[1:6]
with open(env_path) as f:
    env = json.load(f)
env['FRONTEND_URL'] = frontend_url
env['META_REDIRECT_URI'] = meta_uri
env['LINKEDIN_REDIRECT_URI'] = linkedin_uri
with open(out_path, 'w') as f:
    json.dump({'Variables': env}, f)
PYEOF
  $AWS lambda update-function-configuration --function-name social-auth-handler --region "$REGION" \
    --environment "file://$PATCHED_ENV_FILE" >/dev/null
  $AWS lambda wait function-updated --function-name social-auth-handler --region "$REGION"
fi

echo "Patching frontend source (src/aws-config.ts, src/services/api.ts)..."
if [[ $DRY_RUN -eq 1 ]]; then
  echo "   [DRY RUN] would set userPoolId=$USER_POOL_ID userPoolClientId=$APP_CLIENT_ID API_URL=$API_INVOKE_URL"
else
  python3 - "$REPO_ROOT/src/aws-config.ts" "$USER_POOL_ID" "$APP_CLIENT_ID" <<'PYEOF'
import re, sys
path, pool_id, client_id = sys.argv[1:4]
with open(path) as f:
    content = f.read()
content = re.sub(r'userPoolId:\s*"[^"]*"', f'userPoolId: "{pool_id}"', content, count=1)
content = re.sub(r'userPoolClientId:\s*"[^"]*"', f'userPoolClientId: "{client_id}"', content, count=1)
with open(path, 'w') as f:
    f.write(content)
PYEOF

  python3 - "$REPO_ROOT/src/services/api.ts" "$API_INVOKE_URL" <<'PYEOF'
import re, sys
path, api_url = sys.argv[1:3]
with open(path) as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if re.match(r'\s*const API_URL\s*=', line) and '//' not in line.split('const', 1)[0]:
        lines[i] = f'const API_URL = "{api_url}";\n'
        break
with open(path, 'w') as f:
    f.writelines(lines)
PYEOF
  echo "   Patched. Review with: git diff src/aws-config.ts src/services/api.ts"
fi
echo

echo "=== Done ==="
echo
if [[ $DRY_RUN -eq 1 ]]; then
  echo "This was a DRY RUN. Nothing was created. Re-run without --dry-run once"
  echo "the plan above looks right."
else
  echo "New resources created in this account:"
  echo "  IAM roles:       $EXEC_ROLE_NAME, $SCHEDULER_INVOKE_ROLE_NAME"
  echo "  S3 bucket:       $BUCKET_NAME"
  echo "  DynamoDB tables: ${DYNAMO_TABLES[*]}"
  echo "  Cognito pool:    $USER_POOL_ID"
  echo "  Cognito client:  $APP_CLIENT_ID"
  echo "  Lambdas:         ${LAMBDAS[*]}"
  echo "  API Gateway:     $API_ID  ($API_INVOKE_URL)"
  echo "  Amplify app:     https://$GITHUB_BRANCH.$AMPLIFY_DOMAIN"
  echo
  echo "IMPORTANT — Meta and LinkedIn OAuth apps must have these exact redirect"
  echo "URIs registered on their developer portals, or connecting accounts will fail:"
  echo "  $META_REDIRECT_URI"
  echo "  $LINKEDIN_REDIRECT_URI"
  echo
  echo "src/aws-config.ts and src/services/api.ts were patched with the new"
  echo "Cognito/API values. Review the diff, commit, and push to $GITHUB_BRANCH"
  echo "so Amplify builds a working frontend."
  echo
  echo "Reminders:"
  echo "  - Request Bedrock model access (Nova Pro/Micro in us-east-1, Stable"
  echo "    Image Ultra in us-west-2, model catalog in us-east-2) before"
  echo "    generation will work — see migration/SETUP_GUIDE.md Step 4."
  echo "  - The very first business/user you create may need a manual"
  echo "    role: \"ADMIN\" row set in the 'user' DynamoDB table (known bug,"
  echo "    see migration/SETUP_GUIDE.md Step 8)."
fi

# AI Marketing Hub — Setup Guide for a New AWS Account

Welcome. This guide walks you through standing up your own copy of the AI Marketing Hub app, using a "migration package" someone exported from an existing (working) copy of it. It assumes you're comfortable in the AWS Console and can run commands in a terminal, but assumes **zero prior context** on this specific project.

The migration package contains no data and no secrets — it's a blueprint for empty infrastructure. Every account, business, user, and social media connection you'll use will be brand new.

---

## What you're building

A React app (hosted on AWS Amplify) talking to 13 AWS Lambda functions (via API Gateway), backed by DynamoDB tables, an S3 bucket for generated images, Cognito for login, and AWS Bedrock for AI content generation. Users can connect Facebook/Instagram/LinkedIn, generate marketing content with AI, publish it, and schedule future posts.

---

## Step 1 — Prerequisites

Before you start, get all of these ready:

1. **AWS CLI installed and configured** with a profile that has admin (or near-admin) access to your team's AWS account. Test it: `aws sts get-caller-identity --profile <your-profile>` should print your account ID.
2. **Node.js** (v18+) and **npm**, for building/testing the frontend locally if you want to.
3. **A GitHub account with a copy of the app's source code.** You'll need your own fork (or a fresh push of the code) into a repo you control — Amplify needs push access to build from, and you likely don't have that on the original repo.
4. **A GitHub Personal Access Token (PAT)** with `repo` scope, so Amplify can connect to your fork. Generate one at GitHub → Settings → Developer settings → Personal access tokens.
5. **A Meta (Facebook) Developer account** — you'll register your own app, not use the original team's.
6. **A LinkedIn Developer account** — same, your own app.
7. **A SendGrid account** — the app sends emails via SendGrid, not AWS SES. Free tier is fine to start.
8. `python3` on your machine (the scripts use it for JSON handling — it's almost certainly already there if you have a Mac or Linux machine; on Windows, install from python.org or use WSL).

---

## Step 2 — Have your AWS admin create the Lambda execution role

**This script does not create IAM roles or policies — that's a deliberate, permanent design choice, not a shortcut.** Someone with IAM permissions on your account needs to create one role (or several, if your security policy prefers separation) with these permissions, based on exactly what the 13 Lambdas actually do:

| Permission | Why |
|---|---|
| `AWSLambdaBasicExecutionRole` (managed policy) | CloudWatch Logs — every Lambda needs this to write logs |
| `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan` on all 14 tables listed in `INVENTORY.md` (and their indexes) | All the data-layer Lambdas read/write these tables |
| `s3:GetObject`, `PutObject` on your new bucket | Uploading/downloading generated images and video |
| `bedrock:InvokeModel`, `bedrock:Converse` in **us-east-1** (for `us.amazon.nova-pro-v1:0` and `amazon.nova-micro-v1:0`) | Text generation (`generate-marketing-asset`, `generate-caption`) |
| `bedrock:InvokeModel` in **us-west-2** (for `stability.stable-image-ultra-v1:1`) | Image generation |
| `bedrock:ListFoundationModels` in **us-east-2** | The model picker (`get_models`) — yes, this is a 3rd region, see the "known gotcha" note below |
| `scheduler:CreateSchedule`, `UpdateSchedule`, `DeleteSchedule`, `GetSchedule` | `marketing-scheduler` creates EventBridge Scheduler entries at runtime for "publish later" |
| `iam:PassRole` on a second, small role that EventBridge Scheduler assumes to invoke `marketing-scheduler` back (also needs to be created manually — same reasoning as above; it just needs `lambda:InvokeFunction` on `marketing-scheduler`'s own ARN, scoped to schedules with a name prefix like `mktg-*`) | Same as above |
| `lambda:InvokeFunction` on `generate-marketing-asset` and `social-publish-handler-new`'s own ARNs | `marketing-scheduler` calls these directly (Lambda-to-Lambda invoke, not HTTP) when a schedule fires |
| Cognito read (`cognito-idp:AdminGetUser` or similar), if you extend the app to look up Cognito attributes server-side | Not currently used by any Lambda, but harmless to include if your admin wants headroom |

Give the resulting role ARN to whoever runs `create-destination.sh` — it's a required parameter (`--execution-role-arn`).

---

## Step 3 — Register your own OAuth apps and gather secrets

You need 6 values before running the create script. Put them in a file (call it `secrets.env`, don't commit it to git):

```
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
META_APP_ID=...
META_APP_SECRET=...
META_CONFIG_ID=...
SENDGRID_API_KEY=...
```

### LinkedIn
1. Go to https://www.linkedin.com/developers/apps, create a new app.
2. Request the products/scopes: Sign In with LinkedIn, Share on LinkedIn (or whatever the current LinkedIn API product names are — this app posts on the user's behalf and reads their profile).
3. Copy the **Client ID** and **Client Secret** into `secrets.env`.
4. **Don't set the redirect URI yet** — you don't know it until after you run `create-destination.sh` (it depends on your new API Gateway's ID). The script will print the exact URI to add once it's done; come back and add it then.
5. **Known gap, not fixed in this migration**: this app has no LinkedIn token refresh logic. Tokens expire after ~60 days and the user will need to reconnect manually. If you want automatic refresh, that's new work, not something carried over from the original.

### Meta (Facebook + Instagram)
1. Go to https://developers.facebook.com/apps, create a new app (type: Business).
2. Add the Facebook Login and Instagram products.
3. **Note**: the original team's Meta OAuth Lambda logic was scoped but never fully completed. Expect to do some finishing work here — this isn't a fully carried-over, battle-tested integration like LinkedIn's connect flow.
4. Copy the **App ID** and **App Secret** into `secrets.env`.
5. Under Facebook Login → Settings, you'll eventually need a `META_CONFIG_ID` (a Facebook Login for Business configuration ID) — create a login configuration and copy its ID in.
6. Same as LinkedIn — the exact redirect URI depends on your new API Gateway, so add it to the app's allowed redirect URIs *after* running the create script.
7. Your Meta app will need to go through App Review before real (non-developer) users can connect Facebook/Instagram Pages. Use a Test Page under your own developer account while building.

### SendGrid
1. Sign up at sendgrid.com, verify a sender email address.
2. Create an API key with "Mail Send" permission.
3. Put it in `secrets.env` as `SENDGRID_API_KEY`.

---

## Step 4 — Request Bedrock model access

AWS Bedrock requires you to explicitly request access to each model **per region**, before any Lambda can invoke it. Do this in the Bedrock console, "Model access" page, in **each** of these regions:

| Region | Models to request | Used by |
|---|---|---|
| **us-east-1** | `Amazon Nova Pro`, `Amazon Nova Micro` | `generate-marketing-asset` (text), `generate-caption` (text) |
| **us-west-2** | `Stability AI — Stable Image Ultra` | `generate-marketing-asset` (image) |
| **us-east-2** | Whatever you want visible in the model picker dropdown (`get_models`). This Lambda queries **us-east-2's** catalog specifically — a pre-existing quirk explained below. | `get_models` |

### ⚠️ Known gotcha: 3-way Bedrock region split
The app queries Bedrock's model *catalog* (for the dropdown UI) in `us-east-2`, but actually *invokes* text models in `us-east-1` and the image model in `us-west-2`. This is inherited from the original app, not something this migration introduced or fixes. Practically: **the dropdown can show you a model that then fails when you actually try to generate content with it**, if that exact model isn't also active in the invocation region. Two ways to deal with it:
- Simplest: only ever pick the 3 models actually hard-coded into the generation Lambdas (Nova Pro, Nova Micro, Stable Image Ultra) — ignore whatever else the dropdown shows.
- More thorough (not done here, optional future work): fix `get_models` to query the same regions the generation Lambdas actually use, or fix the generation Lambdas to accept the region the picker found the model in.

The full list of model IDs the picker's code recognizes (Claude 3.5 Sonnet v2, Claude 3 Haiku, Claude 3 Sonnet, Titan Text Premier, Nova Lite, Nova Pro, Llama 3 70B, Mistral Large, Titan Image Generator v2, Stable Diffusion XL, Stable Image Core, Stable Image Ultra, Nova Canvas, Nova Reel, Luma Ray v2) is in `INVENTORY.md` if you want to request broader access.

---

## Step 5 — Get the migration package and run the export (if you haven't been handed one already)

If someone already gave you a `migration-package-*.zip`, unzip it and skip to Step 6.

If you're doing the export yourself from the source account:
```bash
cd migration/
./export-source.sh --profile kush --region us-east-2
```
This is read-only against the source account and produces `migration-package-<timestamp>/` plus a matching `.zip`.

---

## Step 6 — Run the create script

```bash
cd migration/
./create-destination.sh \
  --package-dir ./migration-package-<timestamp> \
  --execution-role-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:role/<the role from Step 2> \
  --bucket-name <pick-a-globally-unique-name> \
  --secrets-file ./secrets.env \
  --github-token <your GitHub PAT> \
  --github-repo https://github.com/<your-org>/<your-fork> \
  --profile <your-aws-cli-profile> \
  --region us-east-2 \
  --amplify-region us-east-1 \
  --dry-run
```

**Always run with `--dry-run` first.** It prints every AWS CLI command it would run, without executing any of them — review the plan before committing. This script has never been executed end-to-end against a real account (the person who built it never had credentials for one) — treat the dry-run output as your main safety check, and watch the real run's output closely for errors.

When the dry-run plan looks right, drop `--dry-run` and run for real. It will ask you to type `yes` before doing anything.

**What it does, in order**: S3 bucket → DynamoDB tables (same names as source, they're only unique within your own account) → Cognito user pool + groups + app client → all 13 Lambda functions (using your execution role, secrets pulled from `secrets.env`) → API Gateway with routes wired to your new Lambdas → Amplify app connected to your GitHub fork → finally, patches `social-auth-handler`'s redirect URLs now that your real API Gateway and Amplify URLs exist.

**If it stops with an error about a missing secret**, that's intentional — it will never silently create a Lambda with a blank or fake credential. Fill in the missing value in `secrets.env` and re-run (the script re-runs safely; it updates existing resources instead of erroring on "already exists" for Lambdas).

At the end, it prints:
- Your new API Gateway URL
- Your new Amplify domain
- The exact redirect URIs to add to your Meta and LinkedIn developer apps now (go back and do this)

---

## Step 7 — Point the frontend at your new API

The original app hardcodes its API URL in source rather than reading it from an Amplify environment variable (a pre-existing quirk, not something this migration changed). Edit `src/services/api.ts`:

```ts
const API_URL = "https://l9k0b4he7h.execute-api.us-east-2.amazonaws.com/dev";
```
Change it to the API URL the create script printed, then commit and push to your fork's `master` branch. Amplify will auto-build (auto-build is enabled on the branch by default).

---

## Step 8 — End-to-end verification checklist

Once Amplify finishes its first build:

- [ ] Visit `https://master.<your-amplify-domain>.amplifyapp.com`, sign up a new account
- [ ] Create your first business (Settings → Businesses) — **note**: due to a pre-existing bug carried into this migration, the very first business/user you create may not automatically get admin access; you may need to manually set a `role: "ADMIN"` row in the `user` DynamoDB table for yourself the first time. This is a known gap in the original app, not something new here.
- [ ] Go to Settings → Connected Services, connect LinkedIn — confirm it redirects back successfully (not to `localhost`)
- [ ] Connect Facebook (and confirm an Instagram Business account linked to that Page shows as connected too)
- [ ] Generate a test post from the Dashboard (pick one of the 3 confirmed-working Bedrock models from Step 4)
- [ ] Publish it to at least one connected platform, confirm the post actually appears there
- [ ] Create a scheduled post 5 minutes in the future, confirm it fires and publishes on its own
- [ ] Check Settings → Team Members, invite a second person, confirm they can accept and get access

If anything in that checklist fails, check CloudWatch Logs for the relevant Lambda first — every one of them logs to `/aws/lambda/<function-name>`.

---

## Known loose ends (inherited from the original app — not introduced by this migration, not fixed here)

- **`Schedules.tsx` timezone bug**: schedule times are built with `.toISOString()` (always UTC) but treated as if they were local time — scheduled posts can fire hours off from when the user picked.
- **`Schedules.tsx` display bug**: the schedule list shows a `topic` field that doesn't match what's actually stored (`input_value`) for newer schedules — cosmetic, not functional.
- **LinkedIn tokens don't refresh** — expire ~60 days, user must manually reconnect.
- **Meta/Instagram OAuth logic is incomplete** — expect some finishing work, it was scoped but not fully built in the original.
- **3-way Bedrock region split** — see Step 4.
- **Wide-open CORS** (`AllowOrigins: *`) on the API Gateway — carried over as-is from the source; tighten it if your security posture requires it.
- ~~`send-email`'s `DYNAMO_TABLE` env var pointed at a table name (`MarketingActions`) that didn't exist~~ — **fixed in the source account**, now correctly set to `kushtest-MarketingActions` like every other Lambda. If your migration package was exported before 2026-07-20, re-export to pick up the corrected value.
- **First-admin bootstrap gap** — see Step 8's checklist note.

None of these block getting the app running — they're just things you'll hit eventually and shouldn't be surprised by.

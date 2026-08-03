# AI Marketing Agent

A React + TypeScript + Vite web application with AWS Cognito authentication and a multi-page dark UI for AI-powered marketing content generation.

## Pages

| Route            | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `/login`         | Sign in / Sign up via AWS Cognito (Amplify UI)                        |
| `/welcome`       | Landing screen after login with a "Get Started" CTA                   |
| `/dashboard`     | Generate marketing content via prompt, URL, or image upload           |
| `/history`       | Table of past AI-generated content with status indicators             |
| `/schedules`     | View, manage, and create automated content publishing schedules       |
| `/settings`      | Manage team members, businesses, and connected social platforms       |
| `/onboard`       | Business onboarding flow for new admin users                          |
| `/invite-accept` | Invitation acceptance flow for new users joining an existing business |

All routes except `/login` and `/invite-accept` are protected — unauthenticated users are redirected to `/login` automatically.

---

## Project Structure

```
marketing-ai/
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Welcome.tsx
│   │   ├── Dashboard.tsx
│   │   ├── History.tsx
│   │   ├── Schedules.tsx
│   │   ├── Onboard.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── UserManagement.tsx
│   │   ├── BusinessManagement.tsx
│   │   └── InviteAccept.tsx
│   ├── services/
│   │   ├── api.ts          # All API calls to API Gateway
│   │   ├── auth.ts         # Cognito auth helpers
│   │   └── inviteService.ts
│   ├── constants/
│   │   └── dashboardConstants.ts
│   ├── utils/
│   │   └── idUtils.ts      # Shared ID generation utilities
│   ├── aws-config.ts       # Amplify / Cognito configuration (git-ignored)
│   ├── App.tsx             # Routes and auth guard
│   └── main.tsx
├── lambda/                 # AWS Lambda functions (Python)
│   ├── User-Handler/
│   ├── businessManagement/
│   ├── Invitation-handler/
│   ├── generate-marketing-asset/
│   ├── generate_caption/
│   ├── get_history/
│   ├── get_models/
│   ├── website-crawler/
│   ├── onboarding-business/
│   ├── cognito-post-auth-trigger/
│   ├── send-email/
│   ├── social-auth-handler/        # OAuth connect/disconnect (LinkedIn, Instagram — Facebook no longer self-serve, see below)
│   ├── social-publish-handler-new/ # Publish LinkedIn/Instagram/Facebook — Facebook routes through Make.com
│   ├── marketing-scheduler/        # Schedule CRUD + EventBridge-Scheduler-invoked execution
│   └── (legacy, superseded)/       # social-oauth-handler, social-meta-handler, social-meta-publish-handler, social-publish-handler
└── public/
```

---

## Features

### Content Generation
- Generate marketing content via **text prompt**, **website URL crawl**, or **image upload**
- Supported content types: Flyer, Social Caption, Blog Post, Email, Ad Copy, Image
- Multiple output formats: PDF, HTML, DOCX, TXT, PNG, JPEG
- Powered by **AWS Bedrock** — select from top 5 models per content category
- Download generated content in the selected format
- Copy generated text to clipboard

### Social Media Publishing
- Publish directly to **LinkedIn**, **Facebook**, and **Instagram** from the Dashboard
- Connect / disconnect social platforms from Settings → Connected Services
- OAuth flow for LinkedIn and Meta (Facebook / Instagram)
- `businessId` is scoped per publish call for multi-business support

### Content Scheduling
- Create automated recurring content schedules per platform
- View, edit, activate, deactivate, and delete schedules
- View schedule execution logs per business
- Schedules are scoped by `businessId`

### History
- View all past AI-generated content per business
- Re-open any history item back into the Dashboard to edit and regenerate

### User Management
- Invite team members by email with role assignment (ADMIN / EDITOR / VIEWER)
- Edit and delete users
- Invitation flow via email link with 24-hour expiry
- Cognito user ID linked to existing user record on invite acceptance

### Business Management
- Create, edit, and delete businesses
- Auto-generated `BIZ-XXXXXX` business IDs via shared `idUtils`
- Business ID displayed and copyable after creation

### Invitation Flow
- ADMIN role: full onboarding form (create business + user) on invite acceptance
- Non-ADMIN roles: Cognito ID linked silently, redirected to dashboard
- Invitation marked `Accepted` regardless of role after completion

---

## Shared Utilities

`src/utils/idUtils.ts` — shared ID generation used across the app:

| Function               | Output format   | Used in                              |
| ---------------------- | --------------- | ------------------------------------ |
| `generateUserId()`     | `USR-XXXXXX`    | Onboard.tsx                          |
| `generateBusinessId()` | `BIZ-XXXXXX`    | Onboard.tsx, BusinessManagement.tsx  |
| `generateInvitationId()` | UUID          | UserManagement.tsx, inviteService.ts |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)
- [Git](https://git-scm.com/)

```bash
node -v
npm -v
git --version
```

---

## 1. Create Your Branch on GitHub

1. Go to `https://github.com/mbiswas22/AI_Marketing_Agent`
2. Click the branch dropdown (shows `master`)
3. Type your branch name (e.g. `feature/your-name`) and click **Create branch**

---

## 2. Clone the Repository

```bash
git clone https://github.com/mbiswas22/AI_Marketing_Agent.git
cd AI_Marketing_Agent
```

---

## 3. Switch to Your Branch

```bash
git checkout your-branch-name
```

---

## 4. Pull Latest Changes

```bash
git pull origin master
```

---

## 5. Install Dependencies

```bash
npm install
```

| Package                              | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `aws-amplify`                        | AWS Amplify core — Cognito auth integration |
| `@aws-amplify/ui-react`              | Pre-built Authenticator UI component        |
| `@mui/material`                      | Material UI component library               |
| `@mui/icons-material`                | MUI icon set used across all pages          |
| `@emotion/react` / `@emotion/styled` | Required peer deps for MUI                  |
| `react-router-dom`                   | Client-side routing between pages           |
| `axios`                              | HTTP client for API calls                   |

> **Windows users:** If you see a `rolldown` native binding error, run:
>
> ```bash
> npm install @rolldown/binding-win32-x64-msvc
> ```

> **Note:** Peer dependency warnings about `@xstate/react` requiring React 16-18 are harmless — the app works correctly with React 19.

---

## 6. AWS Cognito Setup

The config lives in `src/aws-config.ts` (git-ignored — create it locally):

```ts
import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "us-east-2_xxxxxxxxx",
      userPoolClientId: "xxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  },
});
```

**Important:** The App Client must be a **Public client** with **no client secret**. Create one via CLI if needed:

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id YOUR_POOL_ID \
  --client-name marketing-ai-public \
  --no-generate-secret \
  --region us-east-2
```

---

## 7. API Gateway

All frontend API calls go through `src/services/api.ts`:

```
https://<api-id>.execute-api.us-east-2.amazonaws.com/dev
```

| Method | Endpoint                            | Description                        |
| ------ | ----------------------------------- | ---------------------------------- |
| GET    | `/users?businessId=`                | List users for a business          |
| POST   | `/users`                            | Create a user                      |
| PUT    | `/users/{userId}`                   | Update a user (businessId in body) |
| DELETE | `/users/{userId}?businessId=`       | Delete a user                      |
| GET    | `/business`                         | List all businesses                |
| POST   | `/business`                         | Create a business                  |
| PUT    | `/business/{businessId}`            | Update a business                  |
| DELETE | `/business/{businessId}`            | Delete a business                  |
| GET    | `/invitations/{invitationId}`       | Get an invitation                  |
| POST   | `/invitations`                      | Create an invitation               |
| PUT    | `/invitations/{invitationId}`       | Update invitation status           |
| POST   | `/generate`                         | Generate marketing content (text)  |
| POST   | `/image`                            | Generate marketing image           |
| POST   | `/crawl`                            | Crawl website and generate content |
| GET    | `/history`                          | Get generation history             |
| GET    | `/models`                           | List available Bedrock models      |
| POST   | `/send-email`                       | Send invitation email              |
| GET    | `/social/connections`               | List social connections            |
| GET    | `/social/linkedin/authorize`        | Get LinkedIn OAuth URL             |
| POST   | `/social/linkedin/publish`          | Publish to LinkedIn                |
| GET    | `/social/meta/authorize`            | Get Meta OAuth URL                 |
| GET    | `/social/meta/pages`                | Get connected Facebook page        |
| POST   | `/social/meta/publish`              | Publish to Facebook                |
| GET    | `/social/meta/instagram`            | Get Instagram connection status    |
| POST   | `/social/meta/instagram/publish`    | Publish to Instagram               |
| DELETE | `/social/connections/{platform}`    | Disconnect a social platform       |
| POST   | `/schedule`                         | Create / manage content schedules  |

---

## 8. Facebook Publishing via Make.com

Facebook is the one platform that does **not** publish directly against Meta's Graph API from this app. Instead, `social-publish-handler-new`'s `FacebookMakeAdapter` (`lambda/social-publish-handler-new/adapters/facebook_make.py`) POSTs a JSON payload to a [Make.com](https://www.make.com/) webhook, and a Make.com scenario does the actual Facebook posting using its own native Facebook connection. LinkedIn and Instagram are unaffected — they still call their platform APIs directly.

There is intentionally **no self-serve "Connect Facebook" flow in this app anymore** — a business's Facebook Page is wired up by an admin directly in the Make.com scenario, not via OAuth in Settings. This section documents that admin setup.

### 8.1 Lambda environment variables

Set these on the `social-publish-handler-new` Lambda (both required — the Lambda will fail to import without them):

| Variable | Description |
| --- | --- |
| `MAKE_WEBHOOK_URL` | The Make.com scenario's Custom Webhook URL |
| `MAKE_WEBHOOK_SECRET` | A shared secret string, checked by the scenario's `Check secret` filter to reject unauthorized calls |

### 8.2 Webhook payload contract

The Lambda POSTs this JSON to `MAKE_WEBHOOK_URL`:

```json
{
  "secret": "<MAKE_WEBHOOK_SECRET>",
  "message": "<post caption text>",
  "businessId": "<this app's business ID>",
  "imageUrl": "<presigned S3 URL — omitted entirely for text-only posts>"
}
```

`imageUrl` is **omitted from the JSON body**, not sent as `null`/empty, when there's no image — the scenario's Router should branch on whether that key is *present*, not on its value.

### 8.3 Required Make.com scenario structure

Build the scenario as:

```
Webhooks (Custom webhook)
  → filter: Check secret            (reject if body.secret ≠ your shared secret)
  → Router
      ├─ route 1: filter "has imageUrl"  → HTTP "Download a file" → Facebook Pages "Upload a Photo" → Webhooks "Webhook response"
      └─ route 2: Fallback route (NOT another "has image" filter — it must be the Router's actual
                    Fallback route, or a filter checking imageUrl does NOT exist, otherwise text-only
                    posts match neither branch and silently get dropped)
                                       → Facebook Pages "Create a Post" → Webhooks "Webhook response"
```

Each **Webhook response** module should return JSON, e.g. `{"postId": "<the ID from that branch's Facebook Pages module>"}` on success (map the actual output field from the Facebook module — don't hardcode it). The Lambda parses this response synchronously and returns the real `postId` to the app, matching Instagram/LinkedIn's response shape.

### 8.4 Critical scenario settings (easy to miss)

- **The scenario must be turned ON (Active)**, not just saved. If you're mid-edit, click **Finish update** to reactivate it.
- **"Immediately as data arrives" must be enabled** (bottom-left toggle, next to "Run once"). If it's off, the scenario only runs on manual "Run once" clicks — real webhook calls get acknowledged but never actually processed, so nothing publishes even though our Lambda sees an HTTP 200.
- Without a **Webhook response** module present and reachable on every path, Make auto-responds `200 Accepted` (plain text) the instant it receives the request, before the scenario runs — the Lambda would then never learn the real `postId` or whether the post actually succeeded.

### 8.5 Associating a business with its Facebook Page

The payload includes `businessId`, not a Facebook Page ID — the scenario needs its own mapping from one to the other. Two approaches:

- **Per-business Router branch** (simplest for a handful of businesses): add a filter branch per business (`businessId` equals `BIZ-XXXX`), each ending in a Facebook Pages module connected to that business's specific Page. Adding a business means manually adding a new branch — doesn't scale automatically, but is fine at small scale.
- **Data Store lookup** (more scalable, needs one Facebook connection with access to all Pages): create a Make Data Store mapping `businessId → pageId`, add a "Search Records" step right after `Check secret`, and map the Facebook Pages module's **Page** field to the looked-up value instead of a fixed dropdown selection.

---

## 9. User Invitation Flow

1. An ADMIN invites a user from **Settings → Team Members**
2. An invitation record is created in DynamoDB and an email is sent via SendGrid
3. The invitee clicks the link → `/invite-accept?token=<invitationId>`
4. **Non-ADMIN roles**: Cognito ID linked to existing user record, invitation marked `Accepted`, redirected to dashboard
5. **ADMIN role**: Full onboarding form shown — creates business + user, then marks invitation `Accepted`

---

## 10. Run the App

```bash
npm run dev
```

Available at `http://localhost:5173`

```bash
npm run build    # production build
npm run preview  # preview production build
npm run lint     # run ESLint
```

---

## 11. Making Changes & Committing

```bash
git status
git add .
git commit -m "short description of what you changed"
```

---

## 12. Push Your Branch

```bash
git push origin your-branch-name
```

First push:

```bash
git push -u origin your-branch-name
```

---

## 13. Stay in Sync

```bash
git pull origin master
```

---

## 14. Open a Pull Request

Go to `https://github.com/mbiswas22/AI_Marketing_Agent` and open a **Pull Request** from your branch into `master`.

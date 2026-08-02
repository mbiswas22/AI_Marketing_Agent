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
│   ├── onboarding-business/
│   ├── send-email/
│   ├── social-oauth-handler/
│   ├── social-meta-handler/
│   ├── social-meta-publish-handler/
│   └── social-publish-handler/
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

## 8. User Invitation Flow

1. An ADMIN invites a user from **Settings → Team Members**
2. An invitation record is created in DynamoDB and an email is sent via SendGrid
3. The invitee clicks the link → `/invite-accept?token=<invitationId>`
4. **Non-ADMIN roles**: Cognito ID linked to existing user record, invitation marked `Accepted`, redirected to dashboard
5. **ADMIN role**: Full onboarding form shown — creates business + user, then marks invitation `Accepted`

---

## 9. Run the App

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

## 10. Making Changes & Committing

```bash
git status
git add .
git commit -m "short description of what you changed"
```

---

## 11. Push Your Branch

```bash
git push origin your-branch-name
```

First push:

```bash
git push -u origin your-branch-name
```

---

## 12. Stay in Sync

```bash
git pull origin master
```

---

## 13. Open a Pull Request

Go to `https://github.com/mbiswas22/AI_Marketing_Agent` and open a **Pull Request** from your branch into `master`.

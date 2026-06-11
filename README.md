# AI Marketing Agent

A React + TypeScript + Vite web application with AWS Cognito authentication and a multi-page dark UI for AI-powered marketing content generation.
hello world 
### Pages
| Route | Description |
|---|---|
| `/login` | Sign in / Sign up via AWS Cognito (Amplify UI) |
| `/welcome` | Landing screen after login with a "Get Started" CTA |
| `/dashboard` | Generate marketing content via prompt, URL, or image upload |
| `/history` | Table of past AI-generated content with status indicators |

All routes except `/login` are protected — unauthenticated users are redirected to `/login` automatically.

---

## Prerequisites

Make sure the following are installed before getting started:

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)
- [Git](https://git-scm.com/)

Verify your installations:
```bash
node -v
npm -v
git --version
```

---

## 1. Create Your Branch on GitHub

Before cloning, create your personal branch on GitHub:

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

Or create and switch in one step if you didn't create it on GitHub:
```bash
git checkout -b your-branch-name
```

---

## 4. Pull Latest Changes

Always pull the latest changes from `master` before starting work:

```bash
git pull origin master
```

---

## 5. Install Dependencies

```bash
npm install
```

This installs all required packages, including:

| Package | Purpose |
|---|---|
| `aws-amplify` | AWS Amplify core — Cognito auth integration |
| `@aws-amplify/ui-react` | Pre-built Authenticator UI component |
| `@mui/material` | Material UI component library |
| `@mui/icons-material` | MUI icon set used across all pages |
| `@emotion/react` / `@emotion/styled` | Required peer deps for MUI |
| `react-router-dom` | Client-side routing between pages |
| `axios` | HTTP client for future API calls |

> **Windows users:** If you see a `rolldown` native binding error, run:
> ```bash
> npm install @rolldown/binding-win32-x64-msvc
> ```

> **Note:** You may see peer dependency warnings about `@xstate/react` requiring React 16-18 while this project uses React 19. These warnings are harmless — npm overrides the peer dep and the app works correctly.

---

## 6. AWS Cognito Setup

Authentication uses AWS Cognito. The config lives in `src/aws-config.ts`:

```ts
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "us-east-2_xxxxxxxxx",
      userPoolClientId: "xxxxxxxxxxxxxxxxxxxxxxxxxx",
    }
  }
});
```

**Important:** The App Client in Cognito must be a **Public client** with **no client secret**. If your client has a secret, Amplify will throw a `SECRET_HASH was not received` error on sign-up/sign-in. To fix it, create a new App Client in the AWS Console with "Generate a client secret" unchecked, or via CLI:

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id YOUR_POOL_ID \
  --client-name marketing-ai-public \
  --no-generate-secret \
  --region us-east-2
```

Then update `userPoolClientId` in `src/aws-config.ts` with the new client ID.

---

## 7. Run the App

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

Other available scripts:
```bash
npm run build    # production build
npm run preview  # preview production build
npm run lint     # run ESLint
```

---

## 8. Making Changes & Committing

### Check status of your changes
```bash
git status
```

### Stage files
```bash
# Stage a specific file
git add src/App.tsx

# Stage all changes
git add .
```

### Commit your changes
```bash
git commit -m "short description of what you changed"
```

---

## 9. Push Your Branch

```bash
git push origin your-branch-name
```

If it's your first push on this branch:
```bash
git push -u origin your-branch-name
```

---

## 10. Pull Before You Push (stay in sync)

Always pull the latest `master` before pushing to avoid conflicts:

```bash
git pull origin master
```

Resolve any merge conflicts, then push your branch as shown in step 9.

---

## 11. Open a Pull Request

Once pushed, go to `https://github.com/mbiswas22/AI_Marketing_Agent` and open a **Pull Request** from your branch into `master`.
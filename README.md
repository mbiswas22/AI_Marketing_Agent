# AI Marketing Agent

A React + TypeScript + Vite web application.

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

> **Windows users:** If you see a `rolldown` native binding error, run:
> ```bash
> npm install @rolldown/binding-win32-x64-msvc
> ```

---

## 6. Run the App

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

## 7. Making Changes & Committing

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

## 8. Push Your Branch

```bash
git push origin your-branch-name
```

If it's your first push on this branch:
```bash
git push -u origin your-branch-name
```

---

## 9. Pull Before You Push (stay in sync)

Always pull the latest `master` before pushing to avoid conflicts:

```bash
git pull origin master
```

Resolve any merge conflicts, then push your branch as shown in step 8.

---

## 10. Open a Pull Request

Once pushed, go to `https://github.com/mbiswas22/AI_Marketing_Agent` and open a **Pull Request** from your branch into `master`.

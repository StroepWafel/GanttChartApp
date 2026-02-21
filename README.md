# Gantt Chart Web App

A full-stack Gantt chart application with optional multi-user auth, persistent storage, task splitting, priority escalation, and a read-only IoT API.

## Features

- Add, edit, complete, and delete tasks
- Split one task into many sub-tasks
- Categorize projects (row groupings)
- Priority escalation as due dates approach
- **Multi-user accounts** with optional username/password auth
- Admin: create users, masquerade, revoke access, revoke API keys, full backup
- Per-user data isolation (each user sees only their categories, projects, tasks)
- Read-only IoT API with per-user API keys
- Server-side user preferences (e.g. priority colors)
- Clear all data option

## Tech Stack

- **Frontend**: React, Vite, TypeScript, gantt-task-react
- **Backend**: Node.js, Express, SQLite (better-sqlite3)

## Development

### Prerequisites

- Node.js 18+
- On **Windows**: better-sqlite3 requires build tools. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload, or use WSL.

### Setup

```bash
npm run install:all
```

### Run (development)

**Option 1: Run both backend and frontend together** (recommended)

```bash
npm run dev
```

This starts:
- **Backend** at http://localhost:3001
- **Frontend** (Vite dev server) at http://localhost:5173

Open **http://localhost:5173** in your browser. The frontend proxies API requests to the backend.

**Option 2: Run backend and frontend separately**

Terminal 1 – backend:
```bash
npm run dev:backend
```

Terminal 2 – frontend:
```bash
npm run dev:frontend
```

Then open http://localhost:5173.

**Production mode** (backend only; serves built frontend):

```bash
npm run build
npm start
```

Access at **http://localhost:3001** (not 5173—the backend serves the frontend).

### Troubleshooting

**"Can't access the frontend" / localhost:5173 won't load**
- Ensure both processes are running. If using `npm run dev`, check the terminal—you should see Vite output with "Local: http://localhost:5173".
- Try Option 2: run `npm run dev:backend` and `npm run dev:frontend` in separate terminals.
- If the backend fails to start (e.g. better-sqlite3 on Windows), the frontend may still run—but API calls will fail. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) or use WSL.

**Only ran `npm start`?**
- The frontend is served by the backend. Open **http://localhost:3001**, not 5173. You must run `npm run build:frontend` first (or `npm run build`).

**Port already in use?**
- Change `PORT` in `.env` for the backend. For the frontend, edit `frontend/vite.config.ts` and set `server.port` to another port (e.g. 5174).

### Build for production

```bash
npm run build
npm start
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `AUTH_ENABLED` | Set to `true` to enable username/password login |
| `AUTH_USERNAME` | Admin username (used when creating first user) |
| `AUTH_PASSWORD` | Admin password (plain, hashed at startup) |
| `AUTH_PASSWORD_HASH` | Optional: pre-computed bcrypt hash (avoids plaintext in .env) |
| `JWT_SECRET` | Secret for signing JWTs (change in production!) |
| `DB_PATH` | Path to SQLite database (default: `./data/gantt.db`) |
| `GITHUB_TOKEN` | Optional: personal access token for update check (5,000 API requests/hr; can also be set in Settings → Updates) |

When auth is enabled, the first user (admin) is created from `AUTH_USERNAME` and `AUTH_PASSWORD` if the users table is empty. Each user gets their own API key from **Settings → Account** for the read-only IoT API.

## Deployment

See [docs/UBUNTU_SETUP.md](docs/UBUNTU_SETUP.md) for Ubuntu server deployment with PM2 and cloudflared (Cloudflare Tunnel).

## Read-Only IoT API

Endpoints under `/api/readonly/*` require **per-user** authentication. Each user has their own API key (view in Settings → Account). Use both headers:

- `X-API-Username` - Your username
- `X-API-Key` - Your API key

Or as query params: `?username=...&api_key=...`

Data returned is scoped to the authenticated user only.

| Endpoint | Description |
|----------|-------------|
| `GET /tasks` | All tasks |
| `GET /most-important-task` | Highest urgency incomplete task |
| `GET /stats` | Total, completed, todo, efficiency |
| `GET /efficiency` | Efficiency ratio |
| `GET /by-category` | Task counts per category |
| `GET /overdue` | Overdue tasks |
| `GET /upcoming?days=7` | Upcoming due tasks |
| `GET /projects` | Projects with task counts |
| `GET /categories` | Categories with counts |

See [docs/API.md](docs/API.md) for full details and examples.

## Migrating to Multi-User

If you're upgrading from an older version with a single admin or shared data, see [docs/MIGRATION.md](docs/MIGRATION.md) for step-by-step migration instructions.

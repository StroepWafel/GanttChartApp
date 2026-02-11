# Gantt Chart Web App

A full-stack Gantt chart application with optional auth, persistent storage, task splitting, priority escalation, and a read-only IoT API.

## Features

- Add, edit, complete, and delete tasks
- Split one task into many sub-tasks
- Categorize projects (row groupings)
- Priority escalation as due dates approach
- Optional email/password authentication
- Read-only API for IoT integration
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

### Run

```bash
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173 (proxies API to backend)

### Build for production

```bash
npm run build
npm start
```

## Configuration

Copy `.env.example` to `.env` and configure:

- `AUTH_ENABLED=true` - Enable email/password login
- `AUTH_EMAIL` - Login email
- `AUTH_PASSWORD` - Login password (plain, hashed at startup)
- `API_KEY` - Optional key for read-only API (`X-API-Key` header)

## Deployment

See [docs/UBUNTU_SETUP.md](docs/UBUNTU_SETUP.md) for Ubuntu server deployment with PM2 and Nginx.

## Read-Only API

Endpoints under `/api/readonly/` (optional `X-API-Key` when configured):

- `GET /tasks` - All tasks
- `GET /most-important-task` - Highest urgency incomplete task
- `GET /stats` - Total, completed, todo, efficiency
- `GET /efficiency` - Efficiency ratio
- `GET /by-category` - Task counts per category
- `GET /overdue` - Overdue tasks
- `GET /upcoming?days=7` - Upcoming due tasks
- `GET /projects` - Projects with task counts
- `GET /categories` - Categories with counts

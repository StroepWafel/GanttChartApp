# Gantt Chart App - Ubuntu Server Setup

This guide covers deploying the Gantt Chart app on a fresh Ubuntu 22.04 LTS server, with PM2 for process management and cloudflared (Cloudflare Tunnel) for secure external access. No public IP, port forwarding, or Nginx required.

## Prerequisites

- Ubuntu 22.04 LTS server
- Root or sudo access
- For **Quick Tunnel**: Nothing else (get a free `*.trycloudflare.com` URL)
- For **Named Tunnel**: Cloudflare account and a domain added to Cloudflare

---

## 0. Local Development (testing on your machine)

To run the app locally before deploying:

```bash
cd GanttChartApp
npm run install:all
npm run dev
```

This starts both the backend and frontend. Open **http://localhost:5173** in your browser (the frontend). The API runs at http://localhost:3001.

To run them separately (e.g. in different terminals):
```bash
# Terminal 1 - backend
npm run dev:backend

# Terminal 2 - frontend
npm run dev:frontend
```
Then open http://localhost:5173.

---

## 1. Initial Server Setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw
sudo ufw allow 22
sudo ufw --force enable
```

Note: Ports 80/443 are not needed—cloudflared tunnels traffic directly to your local app.

Create a non-root user (optional but recommended):

```bash
adduser gantt
usermod -aG sudo gantt
su - gantt
```

---

## 2. Install Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

---

## 3. Install PM2

```bash
sudo npm install -g pm2
```

---

## 4. Clone and Build the Project

```bash
cd /opt  # or your preferred directory
sudo git clone https://github.com/StroepWafel/GanttChartApp
sudo chown -R $USER:$USER GanttChartApp
cd GanttChartApp
```

Install dependencies:

```bash
npm run install:all
```

Build the frontend (static files go to `frontend/dist/`; the backend serves these in production—no separate frontend process):

```bash
npm run build:frontend
```

---

## 5. Environment Configuration

Create `.env` in the project root:

```bash
cp .env.example .env
nano .env
```

Example configuration:

```env
PORT=3001
AUTH_ENABLED=true
AUTH_EMAIL=admin@yourdomain.com
AUTH_PASSWORD=your_secure_password
API_KEY=your_optional_api_key_for_iot
DB_PATH=./data/gantt.db
```

- **AUTH_ENABLED**: Set to `true` to protect the app with email/password.
- **AUTH_PASSWORD**: Plain password (hashed at startup). For production, consider using `AUTH_PASSWORD_HASH` with a pre-computed bcrypt hash.
- **API_KEY**: Optional. When set, the read-only API at `/api/readonly/*` requires `X-API-Key: your_key` header. Leave empty for no API key auth.

Ensure the data directory exists:

```bash
mkdir -p backend/data
```

---

## 6. PM2 Configuration

Create `ecosystem.config.cjs` in the project root:

```javascript
const path = require('path');

module.exports = {
  apps: [{
    name: 'gantt-api',
    script: path.join(__dirname, 'backend/src/server.js'),
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
```

Start the app:

```bash
cd /opt/GanttChartApp
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Check status:

```bash
pm2 status
pm2 logs gantt-api
```

---

## 7. Install and Configure Cloudflared

Install cloudflared:

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
rm cloudflared-linux-amd64.deb
```

### Option A: Quick Tunnel (no account, instant URL)

Get a temporary `*.trycloudflare.com` URL in one command. **Note:** URL changes each time you restart; limit ~200 concurrent requests.

```bash
cloudflared tunnel --url http://127.0.0.1:3001
```

Or run as a service with PM2:

```bash
pm2 start cloudflared --name gantt-tunnel -- tunnel --url http://127.0.0.1:3001
pm2 save
```

The terminal or PM2 logs will show a URL like `https://random-words.trycloudflare.com`.

### Option B: Named Tunnel (persistent custom domain)

Requires a Cloudflare account and a domain in your Cloudflare dashboard.

**1. Log in to Cloudflare:**

```bash
cloudflared tunnel login
```

Visit the URL shown, select your domain, and authorize.

**2. Create a named tunnel:**

```bash
cloudflared tunnel create gantt-app
```

Note the tunnel ID from the output.

**3. Create config file:**

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Add (replace `YOUR_TUNNEL_ID` with the tunnel ID from step 2; the matching `.json` credentials file will be in `~/.cloudflared/`):

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: gantt.yourdomain.com
    service: http://127.0.0.1:3001
  - service: http_status:404
```

**4. Route DNS:**

```bash
cloudflared tunnel route dns gantt-app gantt.yourdomain.com
```

**5. Run the tunnel:**

```bash
cloudflared tunnel run gantt-app
```

Or as a systemd service for auto-start on boot:

```bash
sudo cloudflared service install
```

---

## 8. Verify Deployment

- **Quick Tunnel**: Open the `https://xxx.trycloudflare.com` URL shown in the cloudflared output
- **Named Tunnel**: Open `https://gantt.yourdomain.com` (or your configured hostname)
- HTTPS is provided by Cloudflare automatically—no certificate setup needed
- If auth is enabled, you should see the login page
- If auth is disabled, you should see the Gantt chart

### Read-Only API (for IoT)

When `API_KEY` is set, include the header:

```
X-API-Key: your_api_key
```

Example endpoints:

- `GET /api/readonly/tasks` - All tasks
- `GET /api/readonly/most-important-task` - Highest urgency task
- `GET /api/readonly/stats` - `{ total, completed, todo, efficiency }`
- `GET /api/readonly/overdue` - Overdue tasks
- `GET /api/readonly/upcoming?days=7` - Upcoming due tasks
- `GET /api/readonly/projects` - Projects with counts
- `GET /api/readonly/categories` - Categories
- `GET /api/readonly/by-category` - Task counts per category
- `GET /api/readonly/efficiency` - Efficiency ratio

---

## 9. Maintenance

Restart the app:

```bash
pm2 restart gantt-api
```

View logs:

```bash
pm2 logs gantt-api
```

Update the app:

```bash
cd /opt/GanttChartApp
git pull
npm run install:all
npm run build:frontend
pm2 restart gantt-api
```

If using cloudflared with PM2:

```bash
pm2 restart gantt-tunnel
```

---

## Troubleshooting

**Gray / blank screen when visiting the app**
- Ensure you ran `npm run build:frontend` (or `npm run build`) before starting. The backend serves the built frontend from `frontend/dist/`. If that folder is empty or missing, the app will not load.
- Check the browser console (F12 → Console) for errors. Common: 404 on `/assets/...` (rebuild frontend), or CORS/network errors (check backend is running).

**Auth shows "disabled" despite AUTH_ENABLED=true**
- The `.env` file must be in the **project root** (same folder as `package.json` and `ecosystem.config.cjs`), not in `backend/`.
- After changing `.env`, restart PM2: `pm2 restart gantt-api`

**API returns 401 or blank**
- If auth is enabled, you must log in first. Visit the app URL and use the credentials from `.env`.

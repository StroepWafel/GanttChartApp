# Gantt Chart App - Ubuntu Server Setup

This guide covers deploying the Gantt Chart app on a fresh Ubuntu 22.04 LTS server, with PM2 for process management and Nginx as a reverse proxy.

## Prerequisites

- Ubuntu 22.04 LTS server
- Root or sudo access
- Domain (optional, for SSL)

---

## 1. Initial Server Setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
```

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
sudo git clone https://github.com/YOUR_USER/GanttChartApp.git
sudo chown -R $USER:$USER GanttChartApp
cd GanttChartApp
```

Install dependencies:

```bash
npm run install:all
```

Build the frontend:

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

## 7. Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt install -y nginx
```

Create a config file:

```bash
sudo nano /etc/nginx/sites-available/gantt
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your server IP

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/gantt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. SSL with Let's Encrypt (Optional)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Follow the prompts. Certbot will update the Nginx config to use HTTPS.

---

## 9. Verify Deployment

- Open `http://your-domain.com` (or `http://your-server-ip`)
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

## 10. Maintenance

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

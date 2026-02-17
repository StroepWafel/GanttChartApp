# Migrating to the Multi-User Accounts System

This guide explains how to upgrade from older versions of the Gantt Chart app (single admin, email login, shared data) to the current multi-user accounts system with per-user data and API keys.

## What Changed

| Old | New |
|-----|-----|
| Single admin from `.env` | Multi-user with admin seeded from `.env` on first run |
| Login with email | Login with username |
| Global `API_KEY` for IoT API | Per-user API keys (username + API key) |
| Shared data (all users saw same data) | Per-user data isolation |
| Client-side preferences (localStorage) | Server-side user preferences |

## Automatic Database Migration

When you start the app with an existing database, **migrations run automatically** on startup:

1. **`users` table** – Created if missing. Admin user seeded from `AUTH_USERNAME` (or legacy `AUTH_EMAIL`) and `AUTH_PASSWORD` when the table is empty.

2. **`user_id` columns** – Added to `categories`, `projects`, and `tasks` if missing. Existing rows are assigned to the admin user (`user_id = 1`).

3. **`gantt_expanded`** – Migrated to per-user schema. Old expanded state is preserved for the admin user.

4. **`is_active`** – Added to users; defaults to `1` (active).

5. **`user_preferences`** – New table for server-side preferences (e.g. priority colors).

No manual SQL is required for a typical upgrade.

### Recovering from "no such column: user_id" or "table gantt_expanded_new already exists"

If migrations failed partway (e.g. server crashed during gantt_expanded migration), run:

```bash
cd backend && node scripts/fix-user-id-migration.js
pm2 restart gantt-api
```

---

## Step-by-Step Migration

### 1. Backup Your Data (Recommended)

```bash
# Copy the database
cp backend/data/gantt.db backend/data/gantt.db.backup

# Or export as JSON (if the app supports backup in your version)
# Use the app's backup feature in Settings
```

### 2. Update Environment Variables

Edit `.env`:

```diff
 AUTH_ENABLED=true
-AUTH_EMAIL=admin@example.com
+AUTH_USERNAME=admin
 AUTH_PASSWORD=changeme
-API_KEY=old_global_api_key
+JWT_SECRET=your-secret-change-in-production
```

- **AUTH_USERNAME**: Use a username instead of email (the app login is now username-based). If you had `AUTH_EMAIL=admin@example.com`, you can use `AUTH_USERNAME=admin` or keep the email as the username.
- **AUTH_EMAIL**: Still supported as a fallback for compatibility; `AUTH_USERNAME` takes precedence.
- **API_KEY**: No longer used. Remove it. Each user gets their own API key from the app (Settings → Account).
- **JWT_SECRET**: Required for auth. Generate a random string for production (e.g. `openssl rand -hex 32`).

### 3. Update Dependencies and Build

```bash
npm run install:all
npm run build
```

### 4. Start the App

```bash
npm start
# or
pm2 restart gantt-api
```

On first run, the migrations will:
- Create the admin user from `AUTH_USERNAME` and `AUTH_PASSWORD`
- Assign all existing categories, projects, and tasks to the admin

### 5. Log In

Use your **username** (not email) and password. If you used `AUTH_USERNAME=admin`, log in with `admin` and your password.

### 6. Get Your New API Key

1. Open **Settings**
2. In the **Account** section, view your **API key**
3. Use this with `X-API-Username` and `X-API-Key` for the read-only IoT API

Your old `API_KEY` from `.env` will no longer work. Update any scripts or IoT devices to use:
- `X-API-Username`: your username
- `X-API-Key`: your new key from Settings

---

## IoT / Script Updates

**Old (single API key):**
```bash
curl -H "X-API-Key: $API_KEY" https://your-server/api/readonly/stats
```

**New (per-user):**
```bash
curl -H "X-API-Username: admin" -H "X-API-Key: $API_KEY" https://your-server/api/readonly/stats
```

Or as query parameters:
```bash
curl "https://your-server/api/readonly/stats?username=admin&api_key=$API_KEY"
```

---

## Admin Features (New)

Admins can now:

- **Create users** – Settings → Admin → User management
- **Masquerade** – Act as another user (Settings → Admin → Masquerade)
- **Revoke account access** – Disable a user so they cannot log in
- **Revoke API keys** – Invalidate a user’s API key
- **Regenerate API keys** – Generate a new key for a user
- **Full backup** – Export all users and data (Settings → Admin → Full backup)

---

## Rollback (If Needed)

If you need to revert:

1. Stop the app
2. Restore the database: `cp backend/data/gantt.db.backup backend/data/gantt.db`
3. Restore the old `.env` (with `AUTH_EMAIL`, `API_KEY`, etc.)
4. Use the previous app version

---

## Fresh Install

For a new install, no migration is needed. Set:

```env
AUTH_ENABLED=true
AUTH_USERNAME=admin
AUTH_PASSWORD=changeme
JWT_SECRET=your-secret-change-in-production
DB_PATH=./data/gantt.db
```

Start the app; the admin user will be created on first run.

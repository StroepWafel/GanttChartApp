import './load-env.js';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';

import db from './db.js';
import { optionalAuth, isAuthEnabled } from './auth.js';
import categoriesRouter from './routes/categories.js';
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';
import ganttExpandedRouter from './routes/gantt-expanded.js';
import clearRouter from './routes/clear.js';
import backupRouter from './routes/backup.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import userPreferencesRouter from './routes/user-preferences.js';
import adminRouter from './routes/admin.js';
import settingsRouter from './routes/settings.js';
import updateRouter from './routes/update.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Frontend dist: when running from backend/, it's ../frontend/dist
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

const app = express();
app.use(cors());
app.use(express.json());

// Auth status (no auth required)
app.use('/api/auth', authRouter);

// User management
app.use('/api/users', optionalAuth, usersRouter);

// User preferences
app.use('/api/user-preferences', optionalAuth, userPreferencesRouter);

// Admin-only routes
app.use('/api/admin', adminRouter);
app.use('/api/admin/update', updateRouter);
app.use('/api/settings', optionalAuth, settingsRouter);

// Version (public for update check UI)
app.get('/api/version', (req, res) => {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    res.json({ version: pkg.version || '1.0.0' });
  } catch (_) {
    res.json({ version: '1.0.0' });
  }
});

// Read-only IoT API (username + api_key required)
app.use('/api/readonly', apiRouter);

// Protected routes
app.use('/api/categories', optionalAuth, categoriesRouter);
app.use('/api/projects', optionalAuth, projectsRouter);
app.use('/api/tasks', optionalAuth, tasksRouter);
app.use('/api/gantt-expanded', optionalAuth, ganttExpandedRouter);
app.use('/api/clear', optionalAuth, clearRouter);
app.use('/api/backup', optionalAuth, backupRouter);

// Serve frontend in production
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gantt Chart API running on http://localhost:${PORT}`);
  if (isAuthEnabled()) console.log('Auth: enabled');
  else console.log('Auth: disabled');
});

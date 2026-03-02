import express from 'express';
import { randomUUID } from 'crypto';
import os from 'os';
import db from '../db.js';
import { optionalAuth, requireAdminOrNoAuth } from '../auth.js';

const router = express.Router();
const upsertSetting = db.prepare(`
  INSERT INTO system_settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function getSetting(key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function hasAnyPreference(prefs) {
  if (!prefs || typeof prefs !== 'object') return false;
  if (prefs.environment === true) return true;
  if (prefs.usageCounts === true) return true;
  if (prefs.serverId === true) return true;
  if (prefs.country && typeof prefs.country === 'string' && prefs.country.trim() !== '') return true;
  return false;
}

function buildPayload(preferences) {
  const optIn = hasAnyPreference(preferences);
  const base = {
    type: optIn ? 'statistics' : 'installed',
    optIn,
    timestamp: new Date().toISOString(),
  };
  if (!optIn) return base;

  const payload = { ...base };
  if (preferences.serverId) {
    let serverId = getSetting('statistics_server_id');
    if (!serverId) {
      serverId = randomUUID();
      upsertSetting.run('statistics_server_id', JSON.stringify(serverId));
    }
    payload.serverId = serverId;
  }
  if (preferences.country && typeof preferences.country === 'string' && preferences.country.trim() !== '') {
    payload.country = preferences.country.trim();
  }
  if (preferences.environment) {
    payload.environment = {
      os: process.platform,
      osVersion: os.release(),
      arch: process.arch,
      nodeVersion: process.version,
      runtime: 'Node.js',
    };
  }
  if (preferences.usageCounts) {
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c ?? 0;
    const projectCount = db.prepare('SELECT COUNT(*) as c FROM projects').get()?.c ?? 0;
    const taskCount = db.prepare('SELECT COUNT(*) as c FROM tasks').get()?.c ?? 0;
    const categoryCount = db.prepare('SELECT COUNT(*) as c FROM categories').get()?.c ?? 0;
    let spaceCount = 0;
    try {
      spaceCount = db.prepare('SELECT COUNT(*) as c FROM spaces').get()?.c ?? 0;
    } catch {
      /* spaces table may not exist in older DBs */
    }
    payload.usage = { userCount, projectCount, taskCount, categoryCount, spaceCount };
  }
  return payload;
}

async function sendToStatsEndpoint(payload) {
  // TODO: Add back before release: if (process.env.NODE_ENV !== 'production') return;
  const url = 'https://ganttstats.stroepwafel.au/collect';
  const endpoint = url.replace(/\/$/, '');
  const collectUrl = endpoint.includes('/collect') ? endpoint : `${endpoint}/collect`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(collectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[statistics] Stats endpoint returned', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('[statistics] Failed to send to stats endpoint:', err?.message);
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/status', optionalAuth, requireAdminOrNoAuth, (req, res) => {
  try {
    const sent = getSetting('statistics_prompt_sent');
    res.json({ showPrompt: !sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/confirm', optionalAuth, requireAdminOrNoAuth, async (req, res) => {
  try {
    const { preferences } = req.body || {};
    const prefs = preferences && typeof preferences === 'object' ? preferences : {};
    const optedIn = hasAnyPreference(prefs);

    upsertSetting.run('statistics_prompt_sent', JSON.stringify(optedIn ? 'opted_in' : 'opted_out'));
    upsertSetting.run('statistics_preferences', JSON.stringify(prefs));

    const payload = buildPayload(prefs);
    await sendToStatsEndpoint(payload);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

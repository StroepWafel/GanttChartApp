import db from './db.js';

/** Fire-and-forget: POST task event to user's webhook URL if configured. No retries. */
export async function sendWebhook(userId, event, payload) {
  if (!userId) return;
  let url;
  try {
    const row = db.prepare('SELECT value FROM user_preferences WHERE user_id = ? AND key = ?').get(userId, 'webhook_url');
    if (!row?.value) return;
    const parsed = JSON.parse(row.value);
    if (typeof parsed !== 'string' || !parsed.trim().startsWith('http')) return;
    url = parsed.trim();
  } catch {
    return;
  }
  const body = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
}

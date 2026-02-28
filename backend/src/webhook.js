import db from './db.js';

function buildGenericBody(event, payload) {
  return JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });
}

function buildDiscordBody(event, payload) {
  const isCreate = event === 'task.created';
  const isDelete = event === 'task.deleted';
  const isComplete = event === 'task.completed';
  const title = isCreate ? 'Task created' : isDelete ? 'Task deleted' : isComplete ? 'Task completed' : 'Task updated';
  const color = isCreate ? 0x22c55e : isDelete ? 0xef4444 : isComplete ? 0x10b981 : 0x6366f1;
  const embed = {
    title,
    color,
    fields: [
      { name: 'Task', value: payload.name || '—', inline: false },
      { name: 'Project', value: payload.project_name || '—', inline: true },
      { name: 'Category', value: payload.category_name || '—', inline: true },
      { name: 'Priority', value: String(payload.base_priority ?? 5), inline: true },
      { name: 'Progress', value: `${payload.progress ?? 0}%`, inline: true },
      { name: 'Start', value: payload.start_date || '—', inline: true },
      { name: 'End', value: payload.end_date || '—', inline: true },
      { name: 'Due', value: payload.due_date || '—', inline: true },
      { name: 'Status', value: payload.completed ? 'Completed' : 'In progress', inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify({ embeds: [embed] });
}

function getWebhooks(userId) {
  const webhooks = [];
  try {
    const row = db.prepare('SELECT value FROM user_preferences WHERE user_id = ? AND key = ?').get(userId, 'webhooks');
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        for (const w of parsed) {
          if (w?.url && typeof w.url === 'string' && w.url.trim().startsWith('http')) {
            const events = w.events;
            const sendCreate = events?.created !== false;
            const sendUpdate = events?.updated !== false;
            const sendDelete = events?.deleted !== false;
            const sendCompleted = events?.completed !== false;
            webhooks.push({
              url: w.url.trim(),
              type: w.type === 'discord' ? 'discord' : 'generic',
              events: { created: sendCreate, updated: sendUpdate, deleted: sendDelete, completed: sendCompleted },
            });
          }
        }
      }
    }
    if (webhooks.length === 0) {
      const legacy = db.prepare('SELECT value FROM user_preferences WHERE user_id = ? AND key = ?').get(userId, 'webhook_url');
      if (legacy?.value) {
        const parsed = JSON.parse(legacy.value);
        if (typeof parsed === 'string' && parsed.trim().startsWith('http')) {
          webhooks.push({ url: parsed.trim(), type: 'generic', events: { created: true, updated: true, deleted: true, completed: true } });
        }
      }
    }
  } catch {}
  return webhooks;
}

/** Fire-and-forget: POST task event to user's webhook URLs. No retries. */
export async function sendWebhook(userId, event, payload) {
  if (!userId) return;
  const webhooks = getWebhooks(userId);
  for (const { url, type, events } of webhooks) {
    if (event === 'task.created' && !events.created) continue;
    if (event === 'task.updated' && !events.updated) continue;
    if (event === 'task.deleted' && !events.deleted) continue;
    if (event === 'task.completed' && !events.completed) continue;
    const body = type === 'discord' ? buildDiscordBody(event, payload) : buildGenericBody(event, payload);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  }
}

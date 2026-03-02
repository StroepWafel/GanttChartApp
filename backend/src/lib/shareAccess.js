import db from '../db.js';

/**
 * Check if a user can access an item (category, project, task, or space).
 * @param {number} userId - Current user ID (null = no auth)
 * @param {string} itemType - 'category' | 'project' | 'task' | 'space'
 * @param {number} itemId - Item ID
 * @param {string} [shareToken] - Optional share link token (from X-Share-Token or query)
 * @returns {{ allowed: boolean; permission: 'view' | 'edit' }}
 */
export function canAccess(userId, itemType, itemId, shareToken) {
  if (!userId && !shareToken) return { allowed: false, permission: 'view' };

  const id = parseInt(itemId, 10);
  if (isNaN(id)) return { allowed: false, permission: 'view' };

  // Space: special handling
  if (itemType === 'space') {
    if (shareToken) {
      const link = db.prepare(`
        SELECT permission FROM share_links
        WHERE token = ? AND item_type = 'space' AND item_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).get(shareToken, id);
      if (link) return { allowed: true, permission: link.permission === 'edit' ? 'edit' : 'view' };
    }
    if (userId) {
      const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(id, userId);
      if (member) return { allowed: true, permission: 'edit' };
      const share = db.prepare(`
        SELECT permission FROM user_shares
        WHERE target_user_id = ? AND item_type = 'space' AND item_id = ?
      `).get(userId, id);
      if (share) return { allowed: true, permission: share.permission === 'edit' ? 'edit' : 'view' };
    }
    return { allowed: false, permission: 'view' };
  }

  // 1. Share link (works without userId when token is valid)
  if (shareToken) {
    const link = db.prepare(`
      SELECT permission FROM share_links
      WHERE token = ? AND item_type = ? AND item_id = ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(shareToken, itemType, id);
    if (link) {
      return { allowed: true, permission: link.permission === 'edit' ? 'edit' : 'view' };
    }
    // Token may be for parent space; category/project/task inherit from their space
    const spaceIdForItem = (() => {
      if (itemType === 'category') return db.prepare('SELECT space_id FROM categories WHERE id = ?').get(id)?.space_id;
      if (itemType === 'project') return db.prepare('SELECT space_id FROM projects WHERE id = ?').get(id)?.space_id;
      if (itemType === 'task') {
        const t = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(id);
        return t ? db.prepare('SELECT space_id FROM projects WHERE id = ?').get(t.project_id)?.space_id : null;
      }
      return null;
    })();
    if (spaceIdForItem) {
      const spaceLink = db.prepare(`
        SELECT permission FROM share_links
        WHERE token = ? AND item_type = 'space' AND item_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).get(shareToken, spaceIdForItem);
      if (spaceLink) return { allowed: true, permission: spaceLink.permission === 'edit' ? 'edit' : 'view' };
    }
    // Token may be for parent (category/project); task inherits from project
    if (itemType === 'task') {
      const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(id);
      if (task) {
        const projLink = db.prepare(`
          SELECT permission FROM share_links WHERE token = ? AND item_type = 'project' AND item_id = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        `).get(shareToken, task.project_id);
        if (projLink) return { allowed: true, permission: projLink.permission === 'edit' ? 'edit' : 'view' };
        const proj = db.prepare('SELECT category_id FROM projects WHERE id = ?').get(task.project_id);
        if (proj) {
          const catLink = db.prepare(`
            SELECT permission FROM share_links WHERE token = ? AND item_type = 'category' AND item_id = ?
            AND (expires_at IS NULL OR expires_at > datetime('now'))
          `).get(shareToken, proj.category_id);
          if (catLink) return { allowed: true, permission: catLink.permission === 'edit' ? 'edit' : 'view' };
        }
      }
    }
  }

  if (!userId) return { allowed: false, permission: 'view' };

  // Helper: resolve project_id and category_id for a task
  let projectId = null;
  let categoryId = null;
  let spaceId = null;
  let ownerId = null;

  if (itemType === 'category') {
    const row = db.prepare('SELECT user_id, space_id FROM categories WHERE id = ?').get(id);
    if (!row) return { allowed: false, permission: 'view' };
    ownerId = row.user_id;
    spaceId = row.space_id;
  } else if (itemType === 'project') {
    const row = db.prepare('SELECT p.user_id, p.space_id, p.category_id FROM projects p WHERE p.id = ?').get(id);
    if (!row) return { allowed: false, permission: 'view' };
    ownerId = row.user_id;
    spaceId = row.space_id;
    categoryId = row.category_id;
  } else if (itemType === 'task') {
    const row = db.prepare('SELECT t.user_id, t.project_id FROM tasks t WHERE t.id = ?').get(id);
    if (!row) return { allowed: false, permission: 'view' };
    ownerId = row.user_id;
    projectId = row.project_id;
    const proj = db.prepare('SELECT user_id, space_id, category_id FROM projects WHERE id = ?').get(projectId);
    if (proj) {
      spaceId = proj.space_id;
      categoryId = proj.category_id;
    }
  }

  // 2. Owner match
  if (ownerId === userId) return { allowed: true, permission: 'edit' };

  // 3. Space member
  if (spaceId) {
    const member = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(spaceId, userId);
    if (member) return { allowed: true, permission: 'edit' };
  }

  // 4. Direct user share (target_user_id = current user)
  const share = db.prepare(`
    SELECT permission FROM user_shares
    WHERE target_user_id = ? AND item_type = ? AND item_id = ?
  `).get(userId, itemType, id);
  if (share) return { allowed: true, permission: share.permission === 'edit' ? 'edit' : 'view' };

  // 4b. Access via space share (user has user_share for the item's space)
  if (spaceId) {
    const spaceShare = db.prepare(`
      SELECT permission FROM user_shares
      WHERE target_user_id = ? AND item_type = 'space' AND item_id = ?
    `).get(userId, spaceId);
    if (spaceShare) return { allowed: true, permission: spaceShare.permission === 'edit' ? 'edit' : 'view' };
  }

  // 5. Access via parent: task -> project or category share; project -> category share
  if (itemType === 'task' && projectId) {
    const projShare = db.prepare(`
      SELECT permission FROM user_shares WHERE target_user_id = ? AND item_type = 'project' AND item_id = ?
    `).get(userId, projectId);
    if (projShare) return { allowed: true, permission: projShare.permission === 'edit' ? 'edit' : 'view' };
    if (categoryId) {
      const catShare = db.prepare(`
        SELECT permission FROM user_shares WHERE target_user_id = ? AND item_type = 'category' AND item_id = ?
      `).get(userId, categoryId);
      if (catShare) return { allowed: true, permission: catShare.permission === 'edit' ? 'edit' : 'view' };
    }
  }
  if (itemType === 'project' && categoryId) {
    const catShare = db.prepare(`
      SELECT permission FROM user_shares WHERE target_user_id = ? AND item_type = 'category' AND item_id = ?
    `).get(userId, categoryId);
    if (catShare) return { allowed: true, permission: catShare.permission === 'edit' ? 'edit' : 'view' };
  }

  return { allowed: false, permission: 'view' };
}

/**
 * Get share token from req (header or query)
 */
export function getShareToken(req) {
  return req.headers['x-share-token'] || req.query?.share_token || null;
}

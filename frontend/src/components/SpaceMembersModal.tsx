import { useState, useEffect } from 'react';
import { UserMinus, LogOut, Pencil } from 'lucide-react';
import * as api from '../api';
import './SpaceMembersModal.css';
import './ShareModal.css';

interface SpaceMember {
  user_id: number;
  username: string;
  role: string;
}

interface Props {
  spaceId: number;
  spaceName: string;
  currentUserId: number;
  isAdmin: boolean;
  allowShareWithUsers?: boolean;
  onClose: () => void;
  onDone?: () => void;
  onSpaceRenamed?: (newName: string) => void;
}

export default function SpaceMembersModal({
  spaceId,
  spaceName,
  currentUserId,
  isAdmin,
  allowShareWithUsers = true,
  onClose,
  onDone,
  onSpaceRenamed,
}: Props) {
  const [tab, setTab] = useState<'members' | 'share'>('members');
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [shareableUsers, setShareableUsers] = useState<{ id: number; username: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(spaceName);
  const [shares, setShares] = useState<{
    user_shares_by_me: { id: number; target_user_id: number; target_username?: string; item_type: string; item_id: number; permission: string }[];
    share_links: { id: number; token: string; item_type: string; item_id: number; permission: string; expires_at?: string }[];
  } | null>(null);
  const [shareSelectedUserId, setShareSelectedUserId] = useState<number | null>(null);
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('edit');
  const [linkPermission, setLinkPermission] = useState<'view' | 'edit'>('edit');
  const [joinLinkRole, setJoinLinkRole] = useState<'admin' | 'member'>('member');

  useEffect(() => {
    api.getSpaceMembers(spaceId).then(setMembers).catch(() => setMembers([]));
    api.getShareableUsers().then(setShareableUsers).catch(() => setShareableUsers([]));
    api.getShares().then(setShares).catch(() => setShares(null));
  }, [spaceId]);

  useEffect(() => {
    setRenameValue(spaceName);
  }, [spaceName]);

  const adminCount = members.filter((m) => m.role === 'admin').length;
  const canRemoveSelf = isAdmin && adminCount > 1;

  const sortedMembers = [...members].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    return 0;
  });

  async function handleRemove(userId: number) {
    if (userId === currentUserId && !canRemoveSelf) return;
    setLoading(true);
    setError(null);
    try {
      await api.removeSpaceMember(spaceId, userId);
      const m = await api.getSpaceMembers(spaceId);
      setMembers(m);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setLoading(false);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === spaceName) {
      setIsRenaming(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.updateSpace(spaceId, { name: trimmed });
      setIsRenaming(false);
      setRenameValue(trimmed);
      onSpaceRenamed?.(trimmed);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setLoading(false);
    }
  }

  async function handleLeave() {
    setLoading(true);
    setError(null);
    try {
      await api.leaveSpace(spaceId);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave');
    } finally {
      setLoading(false);
    }
  }

  async function handleShareWithUser() {
    if (!shareSelectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      await api.createUserShare('space', spaceId, shareSelectedUserId, sharePermission);
      const s = await api.getShares();
      setShares(s);
      setShareSelectedUserId(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateLink() {
    setLoading(true);
    setError(null);
    try {
      const link = await api.createShareLink('space', spaceId, linkPermission);
      const s = await api.getShares();
      setShares(s);
      const url = `${window.location.origin}${window.location.pathname}?share_token=${link.token}`;
      await navigator.clipboard.writeText(url);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateJoinLink() {
    setLoading(true);
    setError(null);
    try {
      const link = await api.createShareLink('space', spaceId, 'edit', undefined, { joinLink: true, joinRole: joinLinkRole });
      const s = await api.getShares();
      setShares(s);
      const url = `${window.location.origin}${window.location.pathname}?share_token=${link.token}`;
      await navigator.clipboard.writeText(url);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create join link');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveShare(shareId: number) {
    try {
      await api.deleteUserShare(shareId);
      const s = await api.getShares();
      setShares(s);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  async function handleRevokeLink(linkId: number) {
    try {
      await api.deleteShareLink(linkId);
      const s = await api.getShares();
      setShares(s);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    }
  }

  const myShares = shares?.user_shares_by_me?.filter((us) => us.item_type === 'space' && us.item_id === spaceId) ?? [];
  const myLinks = shares?.share_links?.filter((sl) => sl.item_type === 'space' && sl.item_id === spaceId) ?? [];

  function tokenPreview(token: string, head = 8, tail = 6): string {
    if (!token || token.length <= head + tail) return token;
    return `${token.slice(0, head)}…${token.slice(-tail)}`;
  }

  return (
    <div className="modal-overlay modal-overlay-elevated" onClick={onClose}>
      <div className="modal space-members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="space-members-header">
          {isAdmin && isRenaming ? (
            <form className="space-members-rename-form" onSubmit={handleRename}>
              <label className="space-members-rename-label">Space name</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="space-members-rename-input"
                placeholder="Space name"
                autoFocus
              />
              <div className="space-members-rename-actions">
                <button type="button" className="btn-sm" onClick={() => { setIsRenaming(false); setRenameValue(spaceName); setError(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-sm btn-sm-primary" disabled={!renameValue.trim() || renameValue.trim() === spaceName || loading}>
                  {loading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3>{spaceName}</h3>
              {isAdmin && (
                <button
                  type="button"
                  className="btn-sm space-members-rename-btn"
                  onClick={() => setIsRenaming(true)}
                  title="Rename space"
                  aria-label="Rename space"
                >
                  <Pencil size={12} />
                </button>
              )}
            </>
          )}
        </div>

        {isAdmin && (
          <div className="share-modal-tabs space-members-tabs">
            <button type="button" className={tab === 'members' ? 'active' : ''} onClick={() => { setTab('members'); setError(null); }}>
              Members
            </button>
            <button type="button" className={tab === 'share' ? 'active' : ''} onClick={() => { setTab('share'); setError(null); }}>
              Share
            </button>
          </div>
        )}

        {error && <p className="space-members-error">{error}</p>}

        {tab === 'members' && (
        <ul className="space-members-list">
          {sortedMembers.map((m) => (
            <li key={m.user_id} className="space-members-item">
              <span className="space-members-name">{m.username}</span>
              <span className="space-members-role">{m.role}</span>
              {isAdmin && (m.user_id !== currentUserId || canRemoveSelf) && (
                <button
                  type="button"
                  className="btn-sm btn-ghost space-members-remove"
                  onClick={() => handleRemove(m.user_id)}
                  disabled={loading}
                  title={m.user_id === currentUserId ? 'Leave space' : 'Remove from space'}
                >
                  {m.user_id === currentUserId ? (
                    <><LogOut size={12} /> Leave</>
                  ) : (
                    <><UserMinus size={12} /> Remove</>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
        )}

        {tab === 'share' && isAdmin && (
          <div className="share-modal-section">
            {allowShareWithUsers && (
              <>
                <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Share with users</h4>
                <form
                  className="share-add-row"
                  onSubmit={(e) => { e.preventDefault(); handleShareWithUser(); }}
                >
                  <select
                    value={shareSelectedUserId ?? ''}
                    onChange={(e) => setShareSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  >
                    <option value="">Select user...</option>
                    {shareableUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                  <select value={sharePermission} onChange={(e) => setSharePermission(e.target.value as 'view' | 'edit')}>
                    <option value="view">View only</option>
                    <option value="edit">Can edit</option>
                  </select>
                  <button type="submit" className="btn-sm" disabled={!shareSelectedUserId || loading}>
                    Add
                  </button>
                </form>
                {myShares.length > 0 && (
                  <ul className="share-list">
                    {myShares.map((us) => (
                      <li key={us.id}>
                        <span>{us.target_username ?? us.target_user_id}</span>
                        <span className="share-perm">{us.permission}</span>
                        <button type="button" className="btn-sm" onClick={() => handleRemoveShare(us.id)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                <h4 style={{ margin: '16px 0 12px', fontSize: 13 }}>Share temporarily via Link</h4>
              </>
            )}
            {!allowShareWithUsers && <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Share temporarily</h4>}
            <form
              className="share-add-row"
              onSubmit={(e) => { e.preventDefault(); handleCreateLink(); }}
            >
              <select value={linkPermission} onChange={(e) => setLinkPermission(e.target.value as 'view' | 'edit')}>
                <option value="view">View only</option>
                <option value="edit">Can edit</option>
              </select>
              <button type="submit" className="btn-sm" disabled={loading}>
                Create link (copies to clipboard)
              </button>
            </form>
            <h4 style={{ margin: '16px 0 12px', fontSize: 13 }}>Add with link</h4>
            <p className="settings-desc" style={{ margin: '0 0 8px', fontSize: 12 }}>Creates a link that adds the visitor to this space as a member or admin. Link can only be used once.</p>
            <form
              className="share-add-row"
              onSubmit={(e) => { e.preventDefault(); handleCreateJoinLink(); }}
            >
              <select value={joinLinkRole} onChange={(e) => setJoinLinkRole(e.target.value as 'admin' | 'member')}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="btn-sm" disabled={loading}>
                Create join link (copies to clipboard)
              </button>
            </form>
            {myLinks.length > 0 && (
              <ul className="share-list">
                {myLinks.map((sl) => {
                  const slAny = sl as { is_join_link?: number; join_role?: string; used_at?: string };
                  return (
                  <li key={sl.id}>
                    <span className="share-link-token" title={sl.token}>
                      {tokenPreview(sl.token)}
                      {slAny.is_join_link ? ` (join as ${slAny.join_role || 'member'}${slAny.used_at ? ', used' : ''})` : ` (${sl.permission})`}
                    </span>
                    <button type="button" className="btn-sm" onClick={() => handleRevokeLink(sl.id)}>Revoke</button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === 'members' && !isAdmin && (
          <div className="space-members-footer">
            <button
              type="button"
              className="btn-sm btn-danger"
              onClick={handleLeave}
              disabled={loading}
            >
              <LogOut size={14} /> Leave space
            </button>
          </div>
        )}
        <div className="space-members-modal-footer">
          <button type="button" className="btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import * as api from '../api';
import './ShareModal.css';

type ItemType = 'category' | 'project' | 'task' | 'space';

interface Props {
  itemType: ItemType;
  itemId: number;
  itemName: string;
  onClose: () => void;
  onDone?: () => void;
}

export default function ShareModal({ itemType, itemId, itemName, onClose, onDone }: Props) {
  const [tab, setTab] = useState<'users' | 'link'>('users');
  const [shareableUsers, setShareableUsers] = useState<{ id: number; username: string }[]>([]);
  const [shares, setShares] = useState<{
    user_shares_by_me: { id: number; target_user_id: number; target_username?: string; item_type: string; item_id: number; permission: string }[];
    share_links: { id: number; token: string; item_type: string; item_id: number; permission: string; expires_at?: string }[];
  } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [permission, setPermission] = useState<'view' | 'edit'>('edit');
  const [linkPermission, setLinkPermission] = useState<'view' | 'edit'>('edit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getShareableUsers().then(setShareableUsers).catch(() => setShareableUsers([]));
    api.getShares().then((s) => setShares(s)).catch(() => setShares(null));
  }, []);

  async function handleShareWithUser() {
    if (!selectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      await api.createUserShare(itemType, itemId, selectedUserId, permission);
      const s = await api.getShares();
      setShares(s);
      setSelectedUserId(null);
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
      const link = await api.createShareLink(itemType, itemId, linkPermission);
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

  const myShares = shares?.user_shares_by_me?.filter((us) => {
    const match = us.item_type === itemType && us.item_id === itemId;
    return match;
  }) ?? [];
  const myLinks = shares?.share_links?.filter((sl) => sl.item_type === itemType && sl.item_id === itemId) ?? [];

  function tokenPreview(token: string, head = 8, tail = 6): string {
    if (!token || token.length <= head + tail) return token;
    return `${token.slice(0, head)}…${token.slice(-tail)}`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share: {itemName}</h3>
        <div className="share-modal-tabs">
          <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            Share with users
          </button>
          <button type="button" className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>
            Share link
          </button>
        </div>
        {error && <p className="share-modal-error">{error}</p>}
        {tab === 'users' && (
          <div className="share-modal-section">
            <form
              className="share-add-row"
              onSubmit={(e) => {
                e.preventDefault();
                handleShareWithUser();
              }}
            >
              <select
                value={selectedUserId ?? ''}
                onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">Select user...</option>
                {shareableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
              <select value={permission} onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}>
                <option value="view">View only</option>
                <option value="edit">Can edit</option>
              </select>
              <button type="submit" className="btn-sm" disabled={!selectedUserId || loading}>
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
          </div>
        )}
        {tab === 'link' && (
          <div className="share-modal-section">
            <form
              className="share-add-row"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateLink();
              }}
            >
              <select value={linkPermission} onChange={(e) => setLinkPermission(e.target.value as 'view' | 'edit')}>
                <option value="view">View only</option>
                <option value="edit">Can edit</option>
              </select>
              <button type="submit" className="btn-sm" disabled={loading}>
                Create link (copies to clipboard)
              </button>
            </form>
            {myLinks.length > 0 && (
              <ul className="share-list">
                {myLinks.map((sl) => (
                  <li key={sl.id}>
                    <span className="share-link-token" title={sl.token}>
                      {tokenPreview(sl.token)} ({sl.permission})
                    </span>
                    <button type="button" className="btn-sm" onClick={() => handleRevokeLink(sl.id)}>Revoke</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="share-modal-footer">
          <button type="button" className="btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

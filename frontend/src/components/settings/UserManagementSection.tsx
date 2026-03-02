import { ChevronDown, Pencil } from 'lucide-react';
import * as api from '../../api';
import type { EmailOnboardingSettings } from '../../api';
import { useModal } from '../../context/ModalContext';
import { useAdminAlerts } from '../../context/AdminAlertsContext';

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  apiKey: string | null;
  email?: string | null;
}

interface Props {
  users: User[];
  setUsers: (u: User[] | ((prev: User[]) => User[])) => void;
  currentUser: { id: number; username: string; isAdmin: boolean; apiKey: string | null } | null;
  showUserManagement: boolean;
  setShowUserManagement: (fn: (v: boolean) => boolean) => void;
  emailOnboardingSettings: EmailOnboardingSettings;
  newUsername: string;
  setNewUsername: (v: string) => void;
  newOnboardEmail: string;
  setNewOnboardEmail: (v: string) => void;
  newManualEmail: string;
  setNewManualEmail: (v: string) => void;
  newTempPassword: string;
  setNewTempPassword: (v: string) => void;
  showCreateManually: boolean;
  setShowCreateManually: (fn: (v: boolean) => boolean) => void;
  onboardSending: boolean;
  setOnboardPreviewData: (d: { email: string; username: string; subject: string; body: string } | null) => void;
  editUserEmailId: number | null;
  setEditUserEmailId: (id: number | null) => void;
  editUserEmailValue: string;
  setEditUserEmailValue: (v: string) => void;
  masqueradeUserId: string;
  setMasqueradeUserId: (v: string) => void;
  userMgmtError: string;
  setUserMgmtError: (v: string) => void;
}

export default function UserManagementSection({
  users,
  setUsers,
  currentUser,
  showUserManagement,
  setShowUserManagement,
  emailOnboardingSettings,
  newUsername,
  setNewUsername,
  newOnboardEmail,
  setNewOnboardEmail,
  newManualEmail,
  setNewManualEmail,
  newTempPassword,
  setNewTempPassword,
  showCreateManually,
  setShowCreateManually,
  onboardSending,
  setOnboardPreviewData,
  editUserEmailId,
  setEditUserEmailId,
  editUserEmailValue,
  setEditUserEmailValue,
  masqueradeUserId,
  setMasqueradeUserId,
  userMgmtError,
  setUserMgmtError,
}: Props) {
  const modal = useModal();
  const adminAlerts = useAdminAlerts();

  const emailOnboardingReady =
    emailOnboardingSettings.email_onboarding_enabled &&
    emailOnboardingSettings.email_onboarding_api_key &&
    emailOnboardingSettings.email_onboarding_domain;

  return (
    <>
      <div className="settings-section settings-dropdown">
        <button
          type="button"
          className={`settings-dropdown-trigger ${showUserManagement ? 'expanded' : ''}`}
          onClick={() => setShowUserManagement((v) => !v)}
          aria-expanded={showUserManagement}
        >
          <span>User management</span>
          <ChevronDown size={16} className={showUserManagement ? 'rotated' : ''} />
        </button>
        {showUserManagement && (
          <div className="settings-dropdown-content">
            <div className="user-list">
              {users.map((u) => (
                <div key={u.id} className="user-row user-row-admin">
                  <span className="user-row-name">
                    {u.username}
                    {u.isAdmin && <span className="admin-badge">Admin</span>}
                    {!u.isActive && <span className="inactive-badge">Disabled</span>}
                  </span>
                  {editUserEmailId === u.id ? (
                    <div className="user-email-edit" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                      <input
                        type="email"
                        placeholder="Email"
                        value={editUserEmailValue}
                        onChange={(e) => setEditUserEmailValue(e.target.value)}
                        className="settings-input"
                        style={{ minWidth: '180px' }}
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={async () => {
                          setUserMgmtError('');
                          try {
                            await api.updateUser(u.id, { email: editUserEmailValue.trim() || null });
                            setEditUserEmailId(null);
                            setEditUserEmailValue('');
                            api.getUsers().then(setUsers);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to update email';
                            adminAlerts.addAlert('User management', 'Error', msg);
                            setUserMgmtError(msg);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-sm-danger-outline"
                        onClick={() => {
                          setEditUserEmailId(null);
                          setEditUserEmailValue('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="user-email-display" style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>
                      {u.email ? u.email : '—'}
                      <button
                        type="button"
                        className="btn-sm btn-sm-danger-outline"
                        style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}
                        title="Edit email"
                        onClick={() => {
                          setEditUserEmailId(u.id);
                          setEditUserEmailValue(u.email || '');
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                    </span>
                  )}
                  {u.id !== currentUser?.id && (
                    <div className="user-row-actions">
                      <button
                        type="button"
                        className="btn-sm btn-sm-danger-outline"
                        title={u.isActive ? 'Revoke account access' : 'Restore account access'}
                        onClick={async () => {
                          try {
                            await api.updateUser(u.id, { isActive: !u.isActive });
                            api.getUsers().then(setUsers);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to update user';
                            adminAlerts.addAlert('User management', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
                          }
                        }}
                      >
                        {u.isActive ? 'Revoke account' : 'Restore account'}
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-sm-danger-outline"
                        title="Revoke API key"
                        disabled={!u.apiKey}
                        onClick={async () => {
                          if (!u.apiKey) return;
                          const ok = await modal.showConfirm({
                            title: 'Revoke API key',
                            message: `Revoke API key for ${u.username}? They will need a new key to use the IoT API.`,
                            confirmLabel: 'Revoke',
                            variant: 'danger',
                          });
                          if (!ok) return;
                          try {
                            await api.updateUser(u.id, { revokeApiKey: true });
                            api.getUsers().then(setUsers);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to revoke API key';
                            adminAlerts.addAlert('User management', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
                          }
                        }}
                      >
                        Revoke API key
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        title="Generate new API key"
                        onClick={async () => {
                          try {
                            await api.updateUser(u.id, { regenerateApiKey: true });
                            api.getUsers().then(setUsers);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to regenerate API key';
                            adminAlerts.addAlert('User management', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
                          }
                        }}
                      >
                        New API key
                      </button>
                      {!u.isActive && (
                        <button
                          type="button"
                          className="btn-sm btn-sm-danger"
                          title="Permanently delete this user"
                          onClick={async () => {
                            const ok = await modal.showConfirm({
                              title: 'Delete user permanently',
                              message: `Permanently delete user "${u.username}"? This cannot be undone. Their categories, projects, and tasks will also be removed.`,
                              confirmLabel: 'Delete',
                              variant: 'danger',
                            });
                            if (!ok) return;
                            try {
                              await api.deleteUser(u.id);
                              api.getUsers().then(setUsers);
                            } catch (err) {
                              const msg = err instanceof Error ? err.message : 'Failed to delete user';
                              adminAlerts.addAlert('User management', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
                            }
                          }}
                        >
                          Delete permanently
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="create-user-form">
              {emailOnboardingReady ? (
                <>
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUsername}
                    onChange={(e) => { setNewUsername(e.target.value); setUserMgmtError(''); }}
                    className="settings-input"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newOnboardEmail}
                    onChange={(e) => { setNewOnboardEmail(e.target.value); setUserMgmtError(''); }}
                    className="settings-input"
                  />
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={!newOnboardEmail.trim() || !newUsername.trim() || onboardSending}
                    onClick={async () => {
                      const email = newOnboardEmail.trim();
                      const username = newUsername.trim();
                      if (!email || !username) return;
                      setUserMgmtError('');
                      try {
                        const preview = await api.previewOnboardEmail(username);
                        setOnboardPreviewData({ email, username, subject: preview.subject, body: preview.body });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Failed to preview';
                        adminAlerts.addAlert('User management', 'Error', msg);
                        setUserMgmtError(msg);
                      }
                    }}
                  >
                    Onboard
                  </button>
                  <button
                    type="button"
                    className="btn-sm btn-sm-danger-outline"
                    onClick={() => setShowCreateManually((v) => !v)}
                  >
                    {showCreateManually ? 'Hide' : 'Create manually'}
                  </button>
                  {showCreateManually && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                      <input
                        type="email"
                        placeholder="Email (optional)"
                        value={newManualEmail}
                        onChange={(e) => setNewManualEmail(e.target.value)}
                        className="settings-input"
                      />
                      <input
                        type="password"
                        placeholder="Temporary password"
                        value={newTempPassword}
                        onChange={(e) => setNewTempPassword(e.target.value)}
                        className="settings-input"
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={async () => {
                          if (!newUsername || !newTempPassword) return;
                          setUserMgmtError('');
                          try {
                            await api.createUser(newUsername, newTempPassword, newManualEmail.trim() || undefined);
                            setNewUsername('');
                            setNewTempPassword('');
                            setNewManualEmail('');
                            api.getUsers().then(setUsers);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to create user';
                            adminAlerts.addAlert('User management', 'Error', msg);
                            setUserMgmtError(msg);
                          }
                        }}
                      >
                        Create user
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="settings-input"
                  />
                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={newManualEmail}
                    onChange={(e) => setNewManualEmail(e.target.value)}
                    className="settings-input"
                  />
                  <input
                    type="password"
                    placeholder="Temporary password"
                    value={newTempPassword}
                    onChange={(e) => setNewTempPassword(e.target.value)}
                    className="settings-input"
                  />
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={async () => {
                      if (!newUsername || !newTempPassword) return;
                      setUserMgmtError('');
                      try {
                        await api.createUser(newUsername, newTempPassword, newManualEmail.trim() || undefined);
                        setNewUsername('');
                        setNewTempPassword('');
                        setNewManualEmail('');
                        api.getUsers().then(setUsers);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Failed to create user';
                        adminAlerts.addAlert('User management', 'Error', msg);
                        setUserMgmtError(msg);
                      }
                    }}
                  >
                    Create user
                  </button>
                </>
              )}
            </div>
            {userMgmtError && <p className="auth-error">{userMgmtError}</p>}
          </div>
        )}
      </div>
      <div className="settings-section">
        <h5>Masquerade</h5>
        <p className="settings-desc">Act as another user.</p>
        <div className="masquerade-row">
          <select
            value={masqueradeUserId}
            onChange={(e) => setMasqueradeUserId(e.target.value)}
            className="settings-select"
          >
            <option value="">Select user...</option>
            {users.filter((u) => u.id !== currentUser?.id).map((u) => (
              <option key={u.id} value={String(u.id)}>{u.username}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-sm"
            disabled={!masqueradeUserId}
            onClick={async () => {
              if (!masqueradeUserId) return;
              try {
                await api.masquerade(parseInt(masqueradeUserId, 10));
                setMasqueradeUserId('');
                window.location.reload();
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Masquerade failed';
                adminAlerts.addAlert('User management', 'Error', msg);
                modal.showAlert({ title: 'Error', message: msg });
              }
            }}
          >
            Masquerade
          </button>
        </div>
      </div>
      <div className="settings-section">
        <h5>Full backup</h5>
        <p className="settings-desc">Download backup of all users and data (admin only).</p>
        <div className="settings-button-row">
          <button
            type="button"
            className="btn-sm"
            onClick={async () => {
              try {
                const blob = await api.getAdminFullBackup();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `gantt-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to download full backup';
                adminAlerts.addAlert('Backup', 'Error', msg);
                modal.showAlert({ title: 'Error', message: msg });
              }
            }}
          >
            Download full backup
          </button>
          <button
            type="button"
            className="btn-sm"
            onClick={async () => {
              try {
                const blob = await api.getAdminExportDatabase();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `gantt-export-${new Date().toISOString().slice(0, 10)}.db`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to export database';
                adminAlerts.addAlert('Backup', 'Error', msg);
                modal.showAlert({ title: 'Error', message: msg });
              }
            }}
          >
            Export database
          </button>
        </div>
      </div>
    </>
  );
}

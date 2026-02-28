import * as api from '../../api';
import { useModal } from '../../context/ModalContext';
import { useAdminAlerts } from '../../context/AdminAlertsContext';

interface UpdateCheck {
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseName?: string | null;
  releaseUrl?: string;
  error?: string;
  _debug?: Record<string, unknown>;
}

interface Props {
  appVersion: string | null;
  autoUpdateEnabled: boolean;
  setAutoUpdateEnabled: (v: boolean) => void;
  updateCheck: UpdateCheck | null;
  setUpdateCheck: (v: UpdateCheck | null) => void;
  setShowUpdateDebug: React.Dispatch<React.SetStateAction<boolean>>;
  showUpdateDebug: boolean;
  normalizeUpdateCheck: (d: { updateAvailable?: boolean; currentVersion?: string; latestVersion?: string; releaseName?: string | null; releaseUrl?: string; error?: string; _debug?: unknown }) => UpdateCheck;
  githubTokenSet: boolean;
  githubTokenInput: string;
  setGithubTokenInput: (v: string) => void;
  githubTokenSaving: boolean;
  setGithubTokenSaving: (v: boolean) => void;
  setGithubTokenSet: (v: boolean) => void;
  applyingUpdate: boolean;
  setApplyingUpdate: (v: boolean) => void;
  onUpdateApplySucceeded?: () => void;
}

export default function UpdatesSection({
  appVersion,
  autoUpdateEnabled,
  setAutoUpdateEnabled,
  updateCheck,
  setUpdateCheck,
  setShowUpdateDebug,
  showUpdateDebug,
  normalizeUpdateCheck,
  githubTokenSet,
  githubTokenInput,
  setGithubTokenInput,
  githubTokenSaving,
  setGithubTokenSaving,
  setGithubTokenSet,
  applyingUpdate,
  setApplyingUpdate,
  onUpdateApplySucceeded,
}: Props) {
  const modal = useModal();
  const adminAlerts = useAdminAlerts();

  return (
    <div className="settings-section">
      <h5>Updates</h5>
      <p className="settings-desc settings-version">Version v{appVersion ?? '…'}</p>
      <p className="settings-desc">
        Automatic restarts after update only work when deployed with PM2.
        Update scripts log to <code>data/backups/update.log</code>.
      </p>
      <div className="settings-checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={autoUpdateEnabled}
            onChange={async (e) => {
              const v = e.target.checked;
              setAutoUpdateEnabled(v);
              try {
                await api.patchSettings({ auto_update_enabled: v });
              } catch (err) {
                setAutoUpdateEnabled(!v);
                const msg = err instanceof Error ? err.message : 'Failed to save';
                adminAlerts.addAlert('Updates', 'Error', msg);
                modal.showAlert({ title: 'Error', message: msg });
              }
            }}
          />
          Enable automatic update checks
        </label>
      </div>
      <div className="settings-field-row">
        <label className="input-label">GitHub token (optional)</label>
        <p className="settings-desc" style={{ marginTop: 0 }}>
          Add a personal access token to raise the API rate limit from 60 to 5,000 requests/hour.
          Leave blank to use the default limit.
        </p>
        <p className="settings-desc">
          To generate a token, go to{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
            GitHub settings
          </a>{' '}
          and create a new classic token. Set the expiration date to never and give it the{' '}
          <code>public_repo</code> scope.
        </p>
        <div className="settings-field-controls">
          <input
            type="password"
            className="settings-input"
            placeholder={githubTokenSet ? 'Token configured — enter new token to replace' : 'ghp_… (optional)'}
            value={githubTokenInput}
            onChange={(e) => setGithubTokenInput(e.target.value)}
            autoComplete="off"
            style={{ minWidth: '200px', maxWidth: 560 }}
          />
          <button
            type="button"
            className="btn-sm"
            disabled={githubTokenSaving}
            onClick={async () => {
              const isClear = !githubTokenInput.trim();
              if (isClear) {
                const ok = await modal.showConfirm({
                  title: 'Clear GitHub token',
                  message: 'Remove the saved token? Update checks will use the default rate limit (60 requests/hour).',
                  confirmLabel: 'Clear token',
                  variant: 'danger',
                });
                if (!ok) return;
              }
              setGithubTokenSaving(true);
              try {
                const hadToken = !!githubTokenInput.trim();
                await api.patchSettings({ github_token: githubTokenInput.trim() || '' });
                setGithubTokenSet(!isClear);
                setGithubTokenInput('');
                modal.showAlert({ message: hadToken ? 'Token saved.' : 'Token cleared.' });
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to save';
                adminAlerts.addAlert('Updates', 'Error', msg);
                modal.showAlert({ title: 'Error', message: msg });
              } finally {
                setGithubTokenSaving(false);
              }
            }}
          >
            {githubTokenSaving ? 'Saving…' : (githubTokenInput.trim() ? 'Save token' : 'Clear token')}
          </button>
        </div>
      </div>
      <div className="update-actions">
        <button
          type="button"
          className="btn-sm"
          onClick={async () => {
            setUpdateCheck(null);
            try {
              const data = await api.checkUpdate(false);
              setUpdateCheck(normalizeUpdateCheck(data));
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Check failed';
              setUpdateCheck({ updateAvailable: false, error: msg });
            }
          }}
        >
          Check for updates
        </button>
        <button
          type="button"
          className="btn-sm"
          title="Include debug info (paths, version source) for troubleshooting"
          onClick={async () => {
            setUpdateCheck(null);
            try {
              const data = await api.checkUpdate(true);
              setUpdateCheck(normalizeUpdateCheck(data));
              setShowUpdateDebug(true);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Check failed';
              setUpdateCheck({ updateAvailable: false, error: msg });
            }
          }}
        >
          Check with debug
        </button>
        {updateCheck?.updateAvailable && (
          <button
            type="button"
            className="btn-sm"
            disabled={applyingUpdate}
            onClick={async () => {
              const ok = await modal.showConfirm({
                title: 'Apply update',
                message: `Update to v${updateCheck.latestVersion}? A full backup will be created first. The server will restart and all users will see an update message; this page will reload automatically once it is back.`,
                confirmLabel: 'Update',
              });
              if (!ok) return;
              setApplyingUpdate(true);
              try {
                await api.applyUpdate();
                onUpdateApplySucceeded?.();
              } catch (err) {
                setApplyingUpdate(false);
                const msg = err instanceof Error ? err.message : 'Failed to apply update';
                adminAlerts.addAlert('Updates', 'Error', msg);
                modal.showAlert({ title: 'Error', message: msg });
              }
            }}
          >
            {applyingUpdate ? 'Applying…' : `Apply update (v${updateCheck.latestVersion})`}
          </button>
        )}
      </div>
      {updateCheck && (
        <>
          <p className="settings-desc">
            {updateCheck.updateAvailable ? (
              <>
                Update available: v{updateCheck.latestVersion}
                {updateCheck.releaseName && (
                  <span className="update-release-name"> — {updateCheck.releaseName}</span>
                )}
                {' '}(current: v{updateCheck.currentVersion})
              </>
            ) : updateCheck.error ? (
              <span className="auth-error">{updateCheck.error}</span>
            ) : (
              <>Up to date (v{updateCheck.currentVersion})</>
            )}
          </p>
          {updateCheck._debug && (
            <div className="update-debug">
              <button
                type="button"
                className="btn-sm"
                onClick={() => setShowUpdateDebug((v: boolean) => !v)}
              >
                {showUpdateDebug ? 'Hide' : 'Show'} debug info
              </button>
              {showUpdateDebug && (
                <pre className="update-debug-content" title="Copy this to share when reporting issues">
                  {JSON.stringify(updateCheck._debug, null, 2)}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

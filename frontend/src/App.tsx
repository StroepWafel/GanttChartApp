import { useState, useEffect, useRef } from 'react';
import { getAuthStatus, getMe, getVersion, login } from './api';
import { useServerConnected } from './hooks/useServerConnected';
import { applyTheme, getStoredTheme } from './theme';
import { clearCredentials, getCredentials, isMobileNative } from './credentialStorage';
import AuthGate from './components/AuthGate';
import ResetPassword from './components/ResetPassword';
import ForceChangePassword from './components/ForceChangePassword';
import MainView from './components/MainView';
import { ModalProvider } from './context/ModalContext';
import { AdminAlertsProvider } from './context/AdminAlertsContext';

function getResetToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  if (path.includes('reset-password')) {
    return params.get('token');
  }
  return null;
}

const SLOW_POLL_MS = 15 * 1000; // 15 seconds - frequent enough to catch updating flag before server goes down (~20s window)
const AGGRESSIVE_POLL_MS = 3000; // 3 seconds when waiting for server restart
const RELOAD_DELAY_MS = 2500;
const WAIT_TIMEOUT_MS = 120000;

export default function App() {
  const { online, serverReachable } = useServerConnected();
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('gantt_token'));
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [restoringFromCredentials, setRestoringFromCredentials] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(() => getResetToken());
  const [updatePhase, setUpdatePhase] = useState<null | 'waiting' | 'reloading'>(null);
  const [updatePhaseDetail, setUpdatePhaseDetail] = useState<'preparing' | 'restarting' | null>(null);
  const [updateReloadTimedOut, setUpdateReloadTimedOut] = useState(false);
  const updatePollRef = useRef<{ intervalId: ReturnType<typeof setInterval>; timeoutId: ReturnType<typeof setTimeout>; hasSeenFailure: boolean } | null>(null);

  // Slow poll: all clients check periodically if server is about to restart.
  // Only trust data.updating from server—connection errors (e.g. app sleep, network blip)
  // should NOT trigger the overlay, as they are often transient.
  useEffect(() => {
    if (updatePhase !== null) return;
    const check = async () => {
      try {
        const data = await getVersion();
        if (data.updating) {
          setUpdatePhase('waiting');
          setUpdatePhaseDetail('preparing');
        }
      } catch {
        // Connection error—do not treat as server restart; ignore
      }
    };
    check(); // immediate first check
    const id = setInterval(check, SLOW_POLL_MS);
    return () => clearInterval(id);
  }, [updatePhase]);

  // When waiting: aggressive poll until server is back, then reload.
  // Only reload after we've seen a failure (connection/5xx) then success — never on bootId
  // change alone, since behind a load balancer a different instance can return a different
  // bootId before our origin has restarted.
  useEffect(() => {
    if (updatePhase !== 'waiting') return;
    setUpdateReloadTimedOut(false);
    let hasSeenFailure = false;
    let didReload = false;
    function checkAndReload() {
      if (didReload) return;
      getVersion()
        .then(() => {
          if (didReload) return;
          if (!hasSeenFailure) return;
          didReload = true;
          if (updatePollRef.current) {
            clearInterval(updatePollRef.current.intervalId);
            clearTimeout(updatePollRef.current.timeoutId);
            updatePollRef.current = null;
          }
          setUpdatePhase('reloading');
          setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
        })
        .catch(() => {
          hasSeenFailure = true;
          setUpdatePhaseDetail('restarting');
        });
    }
    checkAndReload();
    const intervalId = setInterval(checkAndReload, AGGRESSIVE_POLL_MS);
    const timeoutId = setTimeout(() => {
      setUpdateReloadTimedOut(true);
      if (updatePollRef.current) {
        clearInterval(updatePollRef.current.intervalId);
        updatePollRef.current = null;
      }
    }, WAIT_TIMEOUT_MS);
    updatePollRef.current = { intervalId, timeoutId, hasSeenFailure: false };
    return () => {
      if (updatePollRef.current) {
        clearInterval(updatePollRef.current.intervalId);
        clearTimeout(updatePollRef.current.timeoutId);
        updatePollRef.current = null;
      }
    };
  }, [updatePhase]);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    getAuthStatus()
      .then((d) => setAuthEnabled(d.enabled))
      .catch(() => setAuthEnabled(false));
  }, []);

  // On native mobile: when localStorage token is gone (e.g. after app update) but we have
  // stored credentials, restore the session so the user stays logged in.
  useEffect(() => {
    if (authEnabled !== true || token !== null || !isMobileNative()) return;
    let cancelled = false;
    setRestoringFromCredentials(true);
    getCredentials()
      .then(async (creds) => {
        if (cancelled || !creds) return null;
        const data = await login(creds.username, creds.password);
        return data.token ?? null;
      })
      .then((newToken) => {
        if (cancelled) return;
        if (newToken) {
          localStorage.setItem('gantt_token', newToken);
          setToken(newToken);
        }
      })
      .catch(() => {
        /* e.g. network error; keep credentials for retry next launch */
      })
      .finally(() => {
        if (!cancelled) setRestoringFromCredentials(false);
      });
    return () => { cancelled = true; };
  }, [authEnabled, token]);

  // When we have a token (e.g. from localStorage), fetch /me to know if user must change password
  useEffect(() => {
    if (!authEnabled || !token || mustChangePassword !== null) return;
    getMe()
      .then((me) => setMustChangePassword(!!me.mustChangePassword))
      .catch(() => setMustChangePassword(false));
  }, [authEnabled, token, mustChangePassword]);

  function goToSignIn() {
    window.history.replaceState({}, '', '/');
    setResetToken(null);
  }

  function handleLogin(data: string | { token: string; mustChangePassword?: boolean }) {
    if (typeof data === 'string') {
      setToken(data);
      setMustChangePassword(false);
    } else {
      setToken(data.token);
      setMustChangePassword(data.mustChangePassword ?? false);
    }
  }

  function handleForceChangeComplete() {
    getMe()
      .then((me) => setMustChangePassword(!!me.mustChangePassword))
      .catch(() => setMustChangePassword(false));
  }

  // Re-check URL when user navigates (e.g. clicks back)
  useEffect(() => {
    const handler = () => setResetToken(getResetToken());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const connectionBanner =
    (!online || !serverReachable) && (
      <div className="offline-banner" role="status" aria-live="polite">
        {!online
          ? 'You are offline. Some features may be unavailable.'
          : 'Disconnected from server. Pull down to refresh when back online.'}
      </div>
    );

  const updateOverlay =
    updatePhase && (
      <div className="update-reload-overlay" role="alert" aria-live="polite">
        <div className="update-reload-overlay-content">
          {updatePhase === 'waiting' && (
            <>
              <p className="update-reload-title">Update in progress</p>
              <p className="update-reload-message">
                {updatePhaseDetail === 'preparing'
                  ? 'Notifying active users. Server will restart shortly and this page will reload automatically.'
                  : updatePhaseDetail === 'restarting'
                    ? 'Server is restarting and building the update. This page will reload automatically when it is back.'
                    : 'The server is restarting. This page will reload automatically when it is back.'}
              </p>
              {updateReloadTimedOut && (
                <>
                  <p className="update-reload-timeout">If the page did not reload, click below to refresh now.</p>
                  <button type="button" className="btn-sm update-reload-refresh-btn" onClick={() => window.location.reload()}>
                    Refresh now
                  </button>
                </>
              )}
            </>
          )}
          {updatePhase === 'reloading' && (
            <>
              <p className="update-reload-title">Update complete</p>
              <p className="update-reload-message">The app was updated. Reloading now…</p>
            </>
          )}
        </div>
      </div>
    );

  if (authEnabled === null) {
    return (
      <>
        {connectionBanner}
        {updateOverlay}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          Loading...
        </div>
      </>
    );
  }

  if (resetToken && authEnabled) {
    return (
      <>
        {connectionBanner}
        {updateOverlay}
        <ResetPassword token={resetToken} onSuccess={goToSignIn} />
      </>
    );
  }

  if (authEnabled && !token) {
    if (restoringFromCredentials) {
      return (
        <>
          {connectionBanner}
          {updateOverlay}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
            Restoring session…
          </div>
        </>
      );
    }
    return (
      <>
        {connectionBanner}
        {updateOverlay}
        <AuthGate onLogin={handleLogin} />
      </>
    );
  }

  if (authEnabled && token && mustChangePassword === null) {
    return (
      <>
        {connectionBanner}
        {updateOverlay}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          Loading...
        </div>
      </>
    );
  }

  if (authEnabled && token && mustChangePassword === true) {
    return (
      <>
        {connectionBanner}
        {updateOverlay}
        <ForceChangePassword onComplete={handleForceChangeComplete} />
      </>
    );
  }

  const showConnectionBanner = !online || !serverReachable;

  return (
    <>
      {connectionBanner}
      {updateOverlay}
      <div className={showConnectionBanner ? 'app-main-with-banner' : undefined}>
        <AdminAlertsProvider>
          <ModalProvider>
            <MainView
          authEnabled={authEnabled}
          onLogout={() => {
            clearCredentials();
            localStorage.removeItem('gantt_token');
            localStorage.removeItem('gantt_token_admin');
            setToken(null);
            setMustChangePassword(null);
          }}
          onUpdateApplySucceeded={() => {
            setUpdatePhase('waiting');
            setUpdatePhaseDetail('preparing');
          }}
        />
          </ModalProvider>
        </AdminAlertsProvider>
      </div>
    </>
  );
}

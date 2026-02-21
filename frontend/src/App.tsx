import { useState, useEffect, useRef } from 'react';
import { getAuthStatus, getMe, getVersion } from './api';
import AuthGate from './components/AuthGate';
import ResetPassword from './components/ResetPassword';
import ForceChangePassword from './components/ForceChangePassword';
import MainView from './components/MainView';
import { ModalProvider } from './context/ModalContext';

function getResetToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  if (path.includes('reset-password')) {
    return params.get('token');
  }
  return null;
}

const SLOW_POLL_MS = 25000;
const AGGRESSIVE_POLL_MS = 2000;
const RELOAD_DELAY_MS = 1500;
const MIN_RELOAD_MESSAGE_MS = 2500; // Show "Reloading now..." at least this long so it's visible
const WAIT_TIMEOUT_MS = 120000;

export default function App() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('gantt_token'));
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => getResetToken());
  const [updatePhase, setUpdatePhase] = useState<null | 'waiting' | 'reloading'>(null);
  const [updateReloadTimedOut, setUpdateReloadTimedOut] = useState(false);
  const updatePollRef = useRef<{ intervalId: ReturnType<typeof setInterval>; timeoutId: ReturnType<typeof setTimeout>; hasSeenFailure: boolean } | null>(null);

  // Slow poll: all clients check periodically if server is about to restart
  useEffect(() => {
    if (updatePhase !== null) return;
    const id = setInterval(async () => {
      try {
        const data = await getVersion();
        if (data.updating) setUpdatePhase('waiting');
      } catch {
        // Connection error might mean server is restarting
        setUpdatePhase('waiting');
      }
    }, SLOW_POLL_MS);
    return () => clearInterval(id);
  }, [updatePhase]);

  // When waiting: aggressive poll until server is back, then reload
  useEffect(() => {
    if (updatePhase !== 'waiting') return;
    setUpdateReloadTimedOut(false);
    let hasSeenFailure = false;
    let didReload = false;
    function checkAndReload() {
      if (didReload) return;
      getVersion()
        .then((data) => {
          if (didReload) return;
          if (hasSeenFailure || !data.updating) {
            didReload = true;
            if (updatePollRef.current) {
              clearInterval(updatePollRef.current.intervalId);
              clearTimeout(updatePollRef.current.timeoutId);
              updatePollRef.current = null;
            }
            setUpdatePhase('reloading');
            setTimeout(() => window.location.reload(), Math.max(RELOAD_DELAY_MS, MIN_RELOAD_MESSAGE_MS));
          }
        })
        .catch(() => {
          hasSeenFailure = true;
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
    getAuthStatus()
      .then((d) => setAuthEnabled(d.enabled))
      .catch(() => setAuthEnabled(false));
  }, []);

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

  const updateOverlay =
    updatePhase && (
      <div className="update-reload-overlay" role="alert" aria-live="polite">
        <div className="update-reload-overlay-content">
          {updatePhase === 'waiting' && (
            <>
              <p className="update-reload-title">Update in progress</p>
              <p className="update-reload-message">The server is restarting. This page will reload automatically when it is back.</p>
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
              <p className="update-reload-title">Application is reloading</p>
              <p className="update-reload-message">The app was updated. Reloading now…</p>
            </>
          )}
        </div>
      </div>
    );

  if (authEnabled === null) {
    return (
      <>
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
        {updateOverlay}
        <ResetPassword token={resetToken} onSuccess={goToSignIn} />
      </>
    );
  }

  if (authEnabled && !token) {
    return (
      <>
        {updateOverlay}
        <AuthGate onLogin={handleLogin} />
      </>
    );
  }

  if (authEnabled && token && mustChangePassword === null) {
    return (
      <>
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
        {updateOverlay}
        <ForceChangePassword onComplete={handleForceChangeComplete} />
      </>
    );
  }

  return (
    <>
      {updateOverlay}
      <ModalProvider>
        <MainView
          authEnabled={authEnabled}
          onLogout={() => {
            localStorage.removeItem('gantt_token');
            localStorage.removeItem('gantt_token_admin');
            setToken(null);
            setMustChangePassword(null);
          }}
          onUpdateApplySucceeded={() => setUpdatePhase('waiting')}
        />
      </ModalProvider>
    </>
  );
}

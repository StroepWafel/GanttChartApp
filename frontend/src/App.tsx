import { useState, useEffect } from 'react';
import { getAuthStatus } from './api';
import AuthGate from './components/AuthGate';
import ResetPassword from './components/ResetPassword';
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

export default function App() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('gantt_token'));
  const [resetToken, setResetToken] = useState<string | null>(() => getResetToken());

  useEffect(() => {
    getAuthStatus()
      .then((d) => setAuthEnabled(d.enabled))
      .catch(() => setAuthEnabled(false));
  }, []);

  function goToSignIn() {
    window.history.replaceState({}, '', '/');
    setResetToken(null);
  }

  // Re-check URL when user navigates (e.g. clicks back)
  useEffect(() => {
    const handler = () => setResetToken(getResetToken());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  if (authEnabled === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (resetToken && authEnabled) {
    return <ResetPassword token={resetToken} onSuccess={goToSignIn} />;
  }

  if (authEnabled && !token) {
    return <AuthGate onLogin={(t) => setToken(t)} />;
  }

  return (
    <ModalProvider>
      <MainView
        authEnabled={authEnabled}
        onLogout={() => { localStorage.removeItem('gantt_token'); localStorage.removeItem('gantt_token_admin'); setToken(null); }}
      />
    </ModalProvider>
  );
}

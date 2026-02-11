import { useState, useEffect } from 'react';
import { getAuthStatus } from './api';
import AuthGate from './components/AuthGate';
import MainView from './components/MainView';

export default function App() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('gantt_token'));

  useEffect(() => {
    getAuthStatus()
      .then((d) => setAuthEnabled(d.enabled))
      .catch(() => setAuthEnabled(false));
  }, []);

  if (authEnabled === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (authEnabled && !token) {
    return <AuthGate onLogin={(t) => setToken(t)} />;
  }

  return (
    <MainView
      authEnabled={authEnabled}
      onLogout={() => { localStorage.removeItem('gantt_token'); setToken(null); }}
    />
  );
}

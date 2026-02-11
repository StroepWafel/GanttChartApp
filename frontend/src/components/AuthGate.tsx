import { useState } from 'react';
import { login } from '../api';

interface Props {
  onLogin: (token: string) => void;
}

export default function AuthGate({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await login(email, password);
      if (data.token) onLogin(data.token);
      else setError(data.error || 'Invalid credentials');
    } catch (err) {
      setError('Login failed');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 280,
          padding: 24,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 4,
        }}
      >
        <h1 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>Sign in</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          style={{
            width: '100%',
            padding: 8,
            marginBottom: 10,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 13,
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: '100%',
            padding: 8,
            marginBottom: 16,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 13,
          }}
        />
        {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
        <button
          type="submit"
          style={{
            width: '100%',
            padding: 10,
            background: 'var(--accent)',
            border: 'none',
            color: 'white',
            fontWeight: 600,
          }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}

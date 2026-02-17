import { useState } from 'react';
import { login } from '../api';
import './AuthGate.css';

interface Props {
  onLogin: (token: string) => void;
}

export default function AuthGate({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await login(username, password);
      if (data.token) onLogin(data.token);
      else setError(data.error || 'Invalid credentials');
    } catch (err) {
      setError('Login failed');
    }
  }

  return (
    <div className="auth-gate">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}

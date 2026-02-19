import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getLoginHash, login } from '../api';
import './AuthGate.css';

interface Props {
  onLogin: (token: string) => void;
}

export default function AuthGate({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await getLoginHash(username);
      const data = await login(username, password);
      if (data.token) onLogin(data.token);
      else setError(data.error || 'Invalid credentials');
    } catch (err) {
      setError('Login failed');
    } finally {
      setIsLoading(false);
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
        <button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="auth-spinner" size={18} aria-hidden />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getLoginHash, login, requestPasswordReset } from '../api';
import './AuthGate.css';

interface Props {
  onLogin: (token: string) => void;
}

export default function AuthGate({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setForgotSuccess('');
    setForgotLoading(true);
    try {
      const data = await requestPasswordReset(forgotEmail.trim());
      setForgotSuccess(data.message || 'If an account exists with that email, we have sent you a reset link.');
      setForgotEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request reset');
    } finally {
      setForgotLoading(false);
    }
  }

  if (showForgotPassword) {
    return (
      <div className="auth-gate">
        <form className="auth-form" onSubmit={handleForgotSubmit}>
          <h1>Reset password</h1>
          <p className="auth-form-desc">Enter your email and we&apos;ll send you a link to reset your password.</p>
          <input
            type="email"
            placeholder="Email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            required
            autoFocus
          />
          {error && <p className="auth-error">{error}</p>}
          {forgotSuccess && <p className="auth-success">{forgotSuccess}</p>}
          <button type="submit" disabled={forgotLoading}>
            {forgotLoading ? (
              <>
                <Loader2 className="auth-spinner" size={18} aria-hidden />
                Sending…
              </>
            ) : (
              'Send reset link'
            )}
          </button>
          <button
            type="button"
            className="auth-link-button"
            onClick={() => {
              setShowForgotPassword(false);
              setError('');
              setForgotSuccess('');
              setForgotEmail('');
            }}
          >
            Back to sign in
          </button>
        </form>
      </div>
    );
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
        <button
          type="button"
          className="auth-link-button"
          onClick={() => setShowForgotPassword(true)}
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}

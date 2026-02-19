import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { resetPassword } from '../api';
import './AuthGate.css';

interface Props {
  token: string;
  onSuccess: () => void;
}

export default function ResetPassword({ token, onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError('Invalid or missing reset link.');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => onSuccess(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired token');
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-gate">
        <div className="auth-form">
          <h1>Reset password</h1>
          <p className="auth-error">{error || 'Invalid or missing reset link.'}</p>
          <button type="button" className="auth-link-button" onClick={onSuccess}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-gate">
        <div className="auth-form">
          <h1>Password reset</h1>
          <p className="auth-success">Your password has been reset. Redirecting to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-gate">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Set new password</h1>
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="auth-spinner" size={18} aria-hidden />
              Resetting…
            </>
          ) : (
            'Reset password'
          )}
        </button>
        <button type="button" className="auth-link-button" onClick={onSuccess}>
          Back to sign in
        </button>
      </form>
    </div>
  );
}

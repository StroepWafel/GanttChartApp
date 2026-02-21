import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { changePassword } from '../api';
import './AuthGate.css';

interface Props {
  onComplete: () => void;
}

export default function ForceChangePassword({ onComplete }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-gate">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Set your password</h1>
        <p className="auth-form-desc">
          You were signed up by email. Please set a new password before continuing.
        </p>
        <input
          type="password"
          placeholder="Current password (from email)"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
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
              Saving…
            </>
          ) : (
            'Set password and continue'
          )}
        </button>
      </form>
    </div>
  );
}

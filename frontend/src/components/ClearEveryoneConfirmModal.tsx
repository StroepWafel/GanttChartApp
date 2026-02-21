import { useState } from 'react';

const CONFIRM_TEXT = 'delete everyone';

interface Props {
  onConfirm: (password: string) => void;
  onCancel: () => void;
  error?: string | null;
}

export default function ClearEveryoneConfirmModal({ onConfirm, onCancel, error }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [typedText, setTypedText] = useState('');
  const [password, setPassword] = useState('');

  if (step === 1) {
    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Delete everyone&apos;s data?</h3>
          <div className="confirm-modal-message">
            This will permanently delete <strong>all</strong> tasks, projects, and categories for <strong>all users</strong>. This cannot be undone. User accounts will remain, but everyone will have no data.
          </div>
          <div className="form-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="button" onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Confirm: type phrase</h3>
          <div className="confirm-modal-message">
            To confirm, type <strong>{CONFIRM_TEXT}</strong> in the box below:
          </div>
          <div className="form-row">
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={CONFIRM_TEXT}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={typedText.toLowerCase() !== CONFIRM_TEXT}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Verify your password</h3>
        <div className="confirm-modal-message">
          Enter your password to authorize this action.
        </div>
        {error && (
          <div className="confirm-modal-message" style={{ color: 'var(--danger)', marginBottom: 8 }}>
            {error}
          </div>
        )}
        <div className="form-row">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
          />
        </div>
        <div className="form-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => onConfirm(password)}
            disabled={!password.trim()}
          >
            Delete everyone&apos;s data
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

const CONFIRM_TEXT = 'clear all';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ClearAllConfirmModal({ onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typedText, setTypedText] = useState('');

  if (step === 1) {
    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Clear all data?</h3>
          <div className="confirm-modal-message">
            This will permanently delete all tasks, projects, and categories. This cannot be undone.
          </div>
          <div className="form-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="button" onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirm clear all</h3>
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
            className="btn-danger"
            onClick={onConfirm}
            disabled={typedText.toLowerCase() !== CONFIRM_TEXT}
          >
            Clear all data
          </button>
        </div>
      </div>
    </div>
  );
}

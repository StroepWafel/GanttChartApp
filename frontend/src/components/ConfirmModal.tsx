import type { ReactNode } from 'react';

interface Props {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="confirm-modal-message">{message}</div>
        <div className="form-actions">
          <button type="button" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            onClick={onConfirm}
            className={variant === 'danger' ? 'btn-danger' : ''}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

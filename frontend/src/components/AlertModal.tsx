import type { ReactNode } from 'react';

interface Props {
  title?: string;
  message: ReactNode;
  onClose: () => void;
}

export default function AlertModal({ title = 'Message', message, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="confirm-modal-message">{message}</div>
        <div className="form-actions">
          <button type="button" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

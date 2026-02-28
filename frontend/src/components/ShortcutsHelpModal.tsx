import { useEffect } from 'react';
import './ShortcutsHelpModal.css';

interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'N', desc: 'New task' },
  { key: 'S', desc: 'Focus search' },
  { key: 'Esc', desc: 'Close modals' },
  { key: '?', desc: 'Show this help' },
];

export default function ShortcutsHelpModal({ onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay shortcuts-help-overlay" onClick={onClose}>
      <div className="shortcuts-help-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        <ul className="shortcuts-list">
          {SHORTCUTS.map(({ key, desc }) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

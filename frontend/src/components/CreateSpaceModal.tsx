import { useState, useRef, useEffect } from 'react';
import * as api from '../api';
import './CreateSpaceModal.css';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateSpaceModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.createSpace(name.trim());
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create space');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-space-modal" onClick={(e) => e.stopPropagation()}>
        <h3>New space</h3>
        <form onSubmit={handleSubmit}>
          <div className="create-space-form-row">
            <label htmlFor="create-space-name">Space name</label>
            <input
              ref={inputRef}
              id="create-space-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter space name"
              className="create-space-input"
              autoComplete="off"
            />
          </div>
          {error && <p className="create-space-error">{error}</p>}
          <div className="create-space-actions">
            <button type="button" className="btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-sm btn-sm-primary" disabled={!name.trim() || loading}>
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { Users, Plus, Settings } from 'lucide-react';
import type { Space } from '../types';
import './SpacesSidebar.css';

interface Props {
  spaces: Space[];
  selectedSpaceId: number | null;
  onSpaceSelect: (id: number | null) => void;
  onRefresh?: () => void;
  onCreateSpace?: () => void;
  onManageSpace?: (space: { id: number; name: string; role?: string }) => void;
}

export default function SpacesSidebar({
  spaces,
  selectedSpaceId,
  onSpaceSelect,
  onCreateSpace,
  onManageSpace,
}: Props) {
  return (
    <div className="spaces-sidebar">
      <div className="spaces-section-all">
        <button
          type="button"
          className={`spaces-item ${selectedSpaceId === null ? 'active' : ''}`}
          onClick={() => onSpaceSelect(null)}
        >
          My space
        </button>
      </div>
      <h4 className="spaces-sidebar-title">
        <Users size={16} /> Spaces
      </h4>
      <ul className="spaces-list">
        {spaces.map((s) => (
          <li key={s.id} className="spaces-list-item-with-actions">
            <button
              type="button"
              className={`spaces-item ${selectedSpaceId === s.id ? 'active' : ''}`}
              onClick={() => onSpaceSelect(s.id)}
            >
              <span className="spaces-item-name">{s.name}</span>
              {s.member_count != null && (
                <span className="spaces-item-count">({s.member_count})</span>
              )}
            </button>
            {s.role === 'admin' && onManageSpace && (
              <button
                type="button"
                className="spaces-manage-btn"
                onClick={(e) => { e.stopPropagation(); onManageSpace({ id: s.id, name: s.name, role: s.role }); }}
                title="Manage space (members & share)"
                aria-label="Manage space"
              >
                <Settings size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {onCreateSpace && (
        <button type="button" className="btn-sm spaces-create-btn" onClick={onCreateSpace}>
          <Plus size={14} /> New space
        </button>
      )}
    </div>
  );
}

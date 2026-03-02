import * as api from '../api';

export type ShareFilterScope = api.ShareFilterScope;
export type ShareSort = api.ShareSort;

interface Props {
  filterScope: ShareFilterScope;
  filterCollaborator: string;
  sort: ShareSort;
  spaces: { id: number; name: string }[];
  collaborators: { id: number; username: string }[];
  onFilterScopeChange: (v: ShareFilterScope) => void;
  onFilterCollaboratorChange: (v: string) => void;
  onSortChange: (v: ShareSort) => void;
}

export default function FilterSortToolbar({
  filterScope,
  filterCollaborator,
  sort,
  spaces,
  collaborators,
  onFilterScopeChange,
  onFilterCollaboratorChange,
  onSortChange,
}: Props) {
  return (
    <div className="filter-sort-toolbar">
      <select
        className="filter-sort-select"
        value={filterScope}
        onChange={(e) => onFilterScopeChange(e.target.value as ShareFilterScope)}
        title="Filter by scope"
      >
        <option value="all">All</option>
        <option value="personal">Personal only</option>
        <option value="shared">Shared / Collaborative</option>
        <option value="spaces">Spaces</option>
        {spaces.map((s) => (
          <option key={s.id} value={`space:${s.id}`}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        className="filter-sort-select"
        value={filterCollaborator}
        onChange={(e) => onFilterCollaboratorChange(e.target.value)}
        title="Filter by collaborator"
      >
        <option value="">All collaborators</option>
        {collaborators.map((c) => (
          <option key={c.id} value={`user:${c.id}`}>
            {c.username}
          </option>
        ))}
      </select>
      <select
        className="filter-sort-select"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as ShareSort)}
        title="Sort"
      >
        <option value="display_order">Display order</option>
        <option value="name">Name</option>
        <option value="shared_first">Shared first</option>
        <option value="collaborators">By collaborator</option>
      </select>
    </div>
  );
}

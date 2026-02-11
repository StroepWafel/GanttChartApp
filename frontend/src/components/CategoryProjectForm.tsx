import { useState } from 'react';
import type { Category } from '../types';

interface Props {
  categories: Category[];
  onAddCategory: (name: string) => void;
  onAddProject: (name: string, categoryId: number) => void;
  onClose: () => void;
}

export default function CategoryProjectForm({
  categories,
  onAddCategory,
  onAddProject,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'category' | 'project'>('category');
  const [catName, setCatName] = useState('');
  const [projName, setProjName] = useState('');
  const [catId, setCatId] = useState(categories[0]?.id || 0);

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (catName.trim()) {
      onAddCategory(catName.trim());
      setCatName('');
      onClose();
    }
  }

  function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    if (projName.trim()) {
      onAddProject(projName.trim(), catId);
      setProjName('');
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="form-tabs">
          <button
            className={mode === 'category' ? 'active' : ''}
            onClick={() => setMode('category')}
          >
            + Category
          </button>
          <button
            className={mode === 'project' ? 'active' : ''}
            onClick={() => setMode('project')}
          >
            + Project
          </button>
        </div>
        {mode === 'category' && (
          <form onSubmit={handleAddCategory}>
            <div className="form-row">
              <label>Category name</label>
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Work"
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button type="submit">Add</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
        {mode === 'project' && categories.length === 0 && (
          <p className="muted">Add a category first.</p>
        )}
        {mode === 'project' && categories.length > 0 && (
          <form onSubmit={handleAddProject}>
            <div className="form-row">
              <label>Project name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g. Q1 Goals"
                autoFocus
              />
            </div>
            <div className="form-row">
              <label>Category</label>
              <select value={catId} onChange={(e) => setCatId(Number(e.target.value))}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit">Add</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

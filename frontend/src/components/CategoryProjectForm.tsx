import { useState, useEffect } from 'react';
import type { Category, Project } from '../types';

interface Props {
  categories: Category[];
  editingCategory?: Category | null;
  editingProject?: Project | null;
  onAddCategory: (name: string) => void;
  onAddProject: (name: string, categoryId: number) => void;
  onUpdateCategory: (id: number, name: string) => void;
  onUpdateProject: (id: number, name: string, categoryId: number) => void;
  onClose: () => void;
}

export default function CategoryProjectForm({
  categories,
  editingCategory,
  editingProject,
  onAddCategory,
  onAddProject,
  onUpdateCategory,
  onUpdateProject,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'category' | 'project'>('category');
  const [catName, setCatName] = useState('');
  const [projName, setProjName] = useState('');
  const [catId, setCatId] = useState(categories[0]?.id || 0);

  const isEditCat = !!editingCategory;
  const isEditProj = !!editingProject;

  useEffect(() => {
    if (editingCategory) {
      setMode('category');
      setCatName(editingCategory.name);
    }
  }, [editingCategory]);

  useEffect(() => {
    if (editingProject) {
      setMode('project');
      setProjName(editingProject.name);
      setCatId(editingProject.category_id);
    }
  }, [editingProject]);

  function reset() {
    setCatName('');
    setProjName('');
    setCatId(categories[0]?.id || 0);
  }

  function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    if (isEditCat && editingCategory) {
      onUpdateCategory(editingCategory.id, catName.trim());
    } else {
      onAddCategory(catName.trim());
    }
    reset();
    onClose();
  }

  function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projName.trim()) return;
    if (isEditProj && editingProject) {
      onUpdateProject(editingProject.id, projName.trim(), catId);
    } else {
      onAddProject(projName.trim(), catId);
    }
    reset();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="form-tabs">
          <button
            className={mode === 'category' ? 'active' : ''}
            onClick={() => { setMode('category'); if (!editingProject) reset(); }}
          >
            {isEditCat ? 'Edit Category' : '+ Category'}
          </button>
          <button
            className={mode === 'project' ? 'active' : ''}
            onClick={() => { setMode('project'); if (!editingCategory) reset(); }}
          >
            {isEditProj ? 'Edit Project' : '+ Project'}
          </button>
        </div>
        {mode === 'category' && (
          <form onSubmit={handleCategorySubmit}>
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
              <button type="submit">{isEditCat ? 'Update' : 'Add'}</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
        {mode === 'project' && categories.length === 0 && (
          <p className="muted">Add a category first.</p>
        )}
        {mode === 'project' && categories.length > 0 && (
          <form onSubmit={handleProjectSubmit}>
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
              <select value={catId} onChange={(e) => setCatId(Number(e.target.value))} disabled={isEditProj}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit">{isEditProj ? 'Update' : 'Add'}</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

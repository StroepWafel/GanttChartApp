import { useState, useEffect } from 'react';
import type { Category, Project } from '../types';

interface Props {
  categories: Category[];
  editingCategory?: Category | null;
  editingProject?: Project | null;
  onAddCategory: (name: string) => void;
  onAddProject: (name: string, categoryId: number, dueDate?: string, startDate?: string) => void;
  onUpdateCategory: (id: number, name: string) => void;
  onUpdateProject: (id: number, name: string, categoryId: number, dueDate?: string | null, startDate?: string | null) => void;
  onRequestDeleteCategory: (cat: Category) => void;
  onRequestDeleteProject: (proj: Project) => void;
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
  onRequestDeleteCategory,
  onRequestDeleteProject,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'category' | 'project'>('category');
  const [catName, setCatName] = useState('');
  const [projName, setProjName] = useState('');
  const [projStartDate, setProjStartDate] = useState('');
  const [projDueDate, setProjDueDate] = useState('');
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
      setProjStartDate(editingProject.start_date?.slice(0, 10) ?? '');
      setProjDueDate(editingProject.due_date?.slice(0, 10) ?? '');
    }
  }, [editingProject]);

  function reset() {
    setCatName('');
    setProjName('');
    setProjStartDate('');
    setProjDueDate('');
    setCatId(categories[0]?.id || 0);
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    if (isEditCat && editingCategory) {
      await onUpdateCategory(editingCategory.id, catName.trim());
    } else {
      await onAddCategory(catName.trim());
    }
    reset();
    onClose();
  }

  async function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projName.trim()) return;
    const start = projStartDate.trim() || undefined;
    const due = projDueDate.trim() || undefined;
    if (isEditProj && editingProject) {
      await onUpdateProject(editingProject.id, projName.trim(), catId, due ?? null, start ?? null);
    } else {
      await onAddProject(projName.trim(), catId, due, start);
    }
    reset();
    onClose();
  }

  function handleDeleteCategory() {
    if (!editingCategory) return;
    onRequestDeleteCategory(editingCategory);
  }

  function handleDeleteProject() {
    if (!editingProject) return;
    onRequestDeleteProject(editingProject);
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
              {isEditCat && (
                <button type="button" className="btn-danger" onClick={handleDeleteCategory}>
                  Delete
                </button>
              )}
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
            <div className="form-row">
              <label>Start date (optional)</label>
              <input
                type="date"
                value={projStartDate}
                onChange={(e) => setProjStartDate(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Due date (optional)</label>
              <input
                type="date"
                value={projDueDate}
                onChange={(e) => setProjDueDate(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button type="submit">{isEditProj ? 'Update' : 'Add'}</button>
              {isEditProj && (
                <button type="button" className="btn-danger" onClick={handleDeleteProject}>
                  Delete
                </button>
              )}
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

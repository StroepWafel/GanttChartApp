import { Pencil, Trash2 } from 'lucide-react';
import type { Category, Project } from '../types';
import CategoryProjectForm from './CategoryProjectForm';
import './CategoriesPage.css';

interface Props {
  categories: Category[];
  projects: Project[];
  editCategory: Category | null;
  editProject: Project | null;
  onAddCategory: (name: string) => void;
  onAddProject: (name: string, categoryId: number, dueDate?: string, startDate?: string) => void;
  onUpdateCategory: (id: number, name: string) => void;
  onUpdateProject: (id: number, name: string, categoryId: number, dueDate?: string | null, startDate?: string | null) => void;
  onRequestDeleteCategory: (cat: Category) => void;
  onRequestDeleteProject: (proj: Project) => void;
  onEditCategory: (cat: Category | null) => void;
  onEditProject: (proj: Project | null) => void;
  showAddForm: boolean;
  onShowAddForm: (show: boolean) => void;
}

export default function CategoriesPage({
  categories,
  projects,
  editCategory,
  editProject,
  onAddCategory,
  onAddProject,
  onUpdateCategory,
  onUpdateProject,
  onRequestDeleteCategory,
  onRequestDeleteProject,
  onEditCategory,
  onEditProject,
  showAddForm,
  onShowAddForm,
}: Props) {
  const showForm = editCategory || editProject || showAddForm;

  return (
    <div className="mobile-page categories-page">
      <div className="categories-page-content">
        {categories.length === 0 ? (
          <p className="muted">No categories yet. Click the button below to add a new category.</p>
        ) : (
          categories.map((c) => (
            <div key={c.id} className="cat-block-page">
              <div className="cat-item-page">
                <span className="cat-name">{c.name}</span>
                <div className="cat-item-actions">
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => { onEditCategory(c); onEditProject(null); onShowAddForm(false); }}
                    title="Edit category"
                    aria-label="Edit category"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    onClick={() => onRequestDeleteCategory(c)}
                    title="Delete category"
                    aria-label="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {projects.filter((p) => p.category_id === c.id).map((p) => (
                <div key={p.id} className="proj-item-page">
                  <span>{p.name}</span>
                  <div className="proj-item-actions">
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={(e) => { e.stopPropagation(); onEditProject(p); onEditCategory(null); onShowAddForm(false); }}
                      title="Edit project"
                      aria-label="Edit project"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      onClick={(e) => { e.stopPropagation(); onRequestDeleteProject(p); }}
                      title="Delete project"
                      aria-label="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <button
          type="button"
          className="btn-add-cat-proj"
          onClick={() => { onEditCategory(null); onEditProject(null); onShowAddForm(true); }}
        >
          + Category / Project
        </button>
      </div>
      {showForm && (
        <div className="categories-form-section">
          <CategoryProjectForm
            categories={categories}
            editingCategory={editCategory ?? undefined}
            editingProject={editProject ?? undefined}
            onAddCategory={onAddCategory}
            onAddProject={onAddProject}
            onUpdateCategory={onUpdateCategory}
            onUpdateProject={onUpdateProject}
            onRequestDeleteCategory={onRequestDeleteCategory}
            onRequestDeleteProject={onRequestDeleteProject}
            onClose={() => { onEditCategory(null); onEditProject(null); onShowAddForm(false); }}
            embedded
          />
        </div>
      )}
    </div>
  );
}

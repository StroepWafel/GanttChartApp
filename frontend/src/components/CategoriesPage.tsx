import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { Category, Project } from '../types';
import CategoryProjectForm from './CategoryProjectForm';
import './CategoriesPage.css';

interface Props {
  categories: Category[];
  projects: Project[];
  /** Full categories for form dropdowns (e.g. when adding project); defaults to categories */
  allCategories?: Category[];
  /** When false, hide categories/projects that have tasks and all are completed */
  includeCompletedInSidebar?: boolean;
  onIncludeCompletedInSidebarChange?: (v: boolean) => void;
  editCategory: Category | null;
  editProject: Project | null;
  onAddCategory: (name: string, apiVisible?: boolean) => void;
  onAddProject: (name: string, categoryId: number, dueDate?: string, startDate?: string, apiVisible?: boolean) => void;
  onUpdateCategory: (id: number, name: string, apiVisible?: boolean) => void;
  onUpdateProject: (id: number, name: string, categoryId: number, dueDate?: string | null, startDate?: string | null, apiVisible?: boolean) => void;
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
  allCategories,
  includeCompletedInSidebar,
  onIncludeCompletedInSidebarChange,
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
  const formCategories = allCategories ?? categories;
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  const isExpanded = (catId: number) => expandedCategories[catId] !== false;
  const toggleCategory = (catId: number) =>
    setExpandedCategories((prev) => ({ ...prev, [catId]: prev[catId] === false }));

  return (
    <div className="mobile-page categories-page">
      <div className="categories-page-content">
        {onIncludeCompletedInSidebarChange != null && (
          <label className="sidebar-filter-row" style={{ fontSize: 11, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={includeCompletedInSidebar ?? true}
              onChange={(e) => onIncludeCompletedInSidebarChange(e.target.checked)}
            />
            Show completed
          </label>
        )}
        {categories.length === 0 ? (
          <p className="muted">No categories yet. Click the button below to add a new category.</p>
        ) : (
          categories.map((c) => {
            const expanded = isExpanded(c.id);
            const projs = projects.filter((p) => p.category_id === c.id);
            return (
            <div key={c.id} className="cat-block-page">
              <div className="cat-item-page">
                <button
                  type="button"
                  className="categories-expand-btn"
                  onClick={() => toggleCategory(c.id)}
                  title={expanded ? 'Collapse' : 'Expand'}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
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
              {expanded && projs.map((p) => (
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
          );})
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
        <CategoryProjectForm
          categories={formCategories}
          editingCategory={editCategory ?? undefined}
          editingProject={editProject ?? undefined}
          onAddCategory={onAddCategory}
          onAddProject={onAddProject}
          onUpdateCategory={onUpdateCategory}
          onUpdateProject={onUpdateProject}
          onRequestDeleteCategory={onRequestDeleteCategory}
          onRequestDeleteProject={onRequestDeleteProject}
          onClose={() => { onEditCategory(null); onEditProject(null); onShowAddForm(false); }}
          embedded={false}
        />
      )}
    </div>
  );
}

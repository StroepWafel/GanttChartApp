import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Category, Project } from '../types';

interface Props {
  sidebarCategories: Category[];
  projectsByCategory: (c: Category) => Project[];
  includeCompletedInSidebar: boolean;
  onIncludeCompletedInSidebarChange: (v: boolean) => void;
  isCategoryExpanded: (catId: number) => boolean;
  onToggleCategoryExpanded: (catId: number) => void;
  onEditCategory: (c: Category) => void;
  onDeleteCategory: (c: Category) => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  onAddCategoryProject: () => void;
  onReorderCategories: (reorderedVisible: Category[]) => void;
  sectionClassName?: string;
}

function SortableCategoryBlock({
  category,
  expanded,
  projects,
  onToggleExpanded,
  onEditCategory,
  onDeleteCategory,
  onEditProject,
  onDeleteProject,
}: {
  category: Category;
  expanded: boolean;
  projects: Project[];
  onToggleExpanded: () => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;

  return (
    <div ref={setNodeRef} style={style} className={`cat-block ${isDragging ? 'cat-block-dragging' : ''}`}>
      <div className="cat-item">
        <div
          className="sidebar-cat-drag-handle"
          {...attributes}
          {...listeners}
          title="Drag to reorder category"
          aria-label="Drag to reorder category"
        >
          <GripVertical size={12} />
        </div>
        <button
          type="button"
          className="sidebar-expand-btn"
          onClick={onToggleExpanded}
          title={expanded ? 'Collapse' : 'Expand'}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="cat-name">{category.name}</span>
        <button type="button" className="sidebar-edit" onClick={onEditCategory} title="Edit category" aria-label="Edit category">
          <Pencil size={12} />
        </button>
        <button type="button" className="sidebar-delete" onClick={onDeleteCategory} title="Delete category" aria-label="Delete category">
          <Trash2 size={12} />
        </button>
      </div>
      {expanded &&
        projects.map((p) => (
          <div key={p.id} className="proj-item">
            <span>{p.name}</span>
            <button
              type="button"
              className="sidebar-edit"
              onClick={(e) => {
                e.stopPropagation();
                onEditProject(p);
              }}
              title="Edit project"
              aria-label="Edit project"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="sidebar-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteProject(p);
              }}
              title="Delete project"
              aria-label="Delete project"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
    </div>
  );
}

export default function SidebarCategoriesSection({
  sidebarCategories,
  projectsByCategory,
  includeCompletedInSidebar,
  onIncludeCompletedInSidebarChange,
  isCategoryExpanded,
  onToggleCategoryExpanded,
  onEditCategory,
  onDeleteCategory,
  onEditProject,
  onDeleteProject,
  onAddCategoryProject,
  onReorderCategories,
  sectionClassName,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const categoryIds = sidebarCategories.map((c) => c.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sidebarCategories.findIndex((c) => c.id === active.id);
    const newIndex = sidebarCategories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderCategories(arrayMove(sidebarCategories, oldIndex, newIndex));
  };

  return (
    <section className={sectionClassName ?? 'sidebar-section'}>
      <h3>Categories</h3>
      <label className="sidebar-filter-row" style={{ fontSize: 11, marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={includeCompletedInSidebar}
          onChange={(e) => onIncludeCompletedInSidebarChange(e.target.checked)}
        />
        Show completed
      </label>
      {sidebarCategories.length === 0 && <p className="muted" style={{ fontSize: 11 }}>No categories yet</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
          {sidebarCategories.map((c) => (
            <SortableCategoryBlock
              key={c.id}
              category={c}
              expanded={isCategoryExpanded(c.id)}
              projects={projectsByCategory(c)}
              onToggleExpanded={() => onToggleCategoryExpanded(c.id)}
              onEditCategory={() => onEditCategory(c)}
              onDeleteCategory={() => onDeleteCategory(c)}
              onEditProject={onEditProject}
              onDeleteProject={onDeleteProject}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" className="btn-link" onClick={onAddCategoryProject}>
        + Category / Project
      </button>
    </section>
  );
}

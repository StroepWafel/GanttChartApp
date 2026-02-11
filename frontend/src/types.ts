export interface Category {
  id: number;
  name: string;
  display_order: number;
  created_at?: string;
}

export interface Project {
  id: number;
  category_id: number;
  name: string;
  due_date?: string | null;
  category_name?: string;
  created_at?: string;
}

export interface Task {
  id: number;
  project_id: number;
  parent_id?: number | null;
  name: string;
  start_date: string;
  end_date: string;
  due_date?: string | null;
  progress: number;
  completed: boolean;
  completed_at?: string | null;
  base_priority: number;
  urgency?: number;
  project_name?: string;
  category_name?: string;
}

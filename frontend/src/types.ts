export interface Category {
  id: number;
  name: string;
  display_order: number;
  created_at?: string;
  space_id?: number | null;
  space_name?: string | null;
}

export interface Project {
  id: number;
  category_id: number;
  name: string;
  start_date?: string | null;
  due_date?: string | null;
  category_name?: string;
  created_at?: string;
  space_id?: number | null;
  space_name?: string | null;
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
  display_order?: number;
  urgency?: number;
  project_name?: string;
  category_name?: string;
}

export interface Space {
  id: number;
  name: string;
  role?: string;
  member_count?: number;
  created_by?: number;
  created_at?: string;
}

export interface SpaceMember {
  user_id: number;
  username: string;
  role: string;
}

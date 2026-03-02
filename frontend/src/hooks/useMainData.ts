import { useState, useCallback, useEffect } from 'react';
import * as api from '../api';
import type { Category, Project, Task } from '../types';

export type MainDataFilters = {
  filterScope?: api.ShareFilterScope;
  filterCollaborator?: string;
  sort?: api.ShareSort;
  shareToken?: string;
};

export function useMainData(includeCompleted: boolean, filters?: MainDataFilters) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const opts = filters ? {
      shareToken: filters.shareToken,
      filterScope: filters.filterScope,
      filterCollaborator: filters.filterCollaborator,
      sort: filters.sort,
    } : undefined;
    const [cats, projs, t] = await Promise.all([
      api.getCategories(opts),
      api.getProjects(opts),
      api.getTasks(includeCompleted, opts),
    ]);
    setCategories(cats);
    setProjects(projs);
    setTasks(t);
  }, [includeCompleted, filters?.filterScope, filters?.filterCollaborator, filters?.sort, filters?.shareToken]);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, projects, tasks, load, setCategories, setProjects, setTasks };
}

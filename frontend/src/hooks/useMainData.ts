import { useState, useCallback, useEffect } from 'react';
import * as api from '../api';
import type { Category, Project, Task } from '../types';

export function useMainData(includeCompleted: boolean) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const [cats, projs, t] = await Promise.all([
      api.getCategories(),
      api.getProjects(),
      api.getTasks(includeCompleted),
    ]);
    setCategories(cats);
    setProjects(projs);
    setTasks(t);
  }, [includeCompleted]);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, projects, tasks, load, setCategories, setProjects, setTasks };
}

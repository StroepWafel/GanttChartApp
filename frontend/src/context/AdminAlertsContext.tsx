import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'gantt_admin_alerts';
const MAX_ALERTS = 50;

export interface AdminAlert {
  id: string;
  source: string;
  title: string;
  message: string;
  timestamp: number;
}

interface AdminAlertsContextValue {
  alerts: AdminAlert[];
  addAlert: (source: string, title: string, message: string) => void;
  dismissAlert: (id: string) => void;
  dismissAll: () => void;
}

const AdminAlertsContext = createContext<AdminAlertsContextValue | null>(null);

function loadAlerts(): AdminAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a: unknown) => a && typeof a === 'object' && 'id' in a && 'source' in a && 'title' in a && 'message' in a)
      .map((a: { id: string; source: string; title: string; message: string; timestamp?: number }) => ({
        ...a,
        timestamp: a.timestamp ?? 0,
      }))
      .slice(-MAX_ALERTS);
  } catch {
    return [];
  }
}

function saveAlerts(alerts: AdminAlert[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {}
}

export function AdminAlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AdminAlert[]>(loadAlerts);

  useEffect(() => {
    saveAlerts(alerts);
  }, [alerts]);

  const addAlert = useCallback((source: string, title: string, message: string) => {
    const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const alert: AdminAlert = { id, source, title, message, timestamp: Date.now() };
    setAlerts((prev) => [...prev.slice(-(MAX_ALERTS - 1)), alert]);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts([]);
  }, []);

  return (
    <AdminAlertsContext.Provider value={{ alerts, addAlert, dismissAlert, dismissAll }}>
      {children}
    </AdminAlertsContext.Provider>
  );
}

export function useAdminAlerts(): AdminAlertsContextValue {
  const ctx = useContext(AdminAlertsContext);
  if (!ctx) {
    return {
      alerts: [],
      addAlert: () => {},
      dismissAlert: () => {},
      dismissAll: () => {},
    };
  }
  return ctx;
}

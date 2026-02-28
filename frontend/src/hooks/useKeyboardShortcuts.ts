import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onNewTask?: () => void;
  onFocusSearch?: () => void;
  onEscape?: () => void;
  onShowShortcuts?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onNewTask,
  onFocusSearch,
  onEscape,
  onShowShortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key !== 'Escape' && e.key !== '?') return;
      }
      switch (e.key) {
        case 'n':
        case 'N':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            onNewTask?.();
            e.preventDefault();
          }
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            onFocusSearch?.();
            e.preventDefault();
          }
          break;
        case 'Escape':
          onEscape?.();
          break;
        case '?':
          if (!e.shiftKey) break;
          onShowShortcuts?.();
          e.preventDefault();
          break;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onNewTask, onFocusSearch, onEscape, onShowShortcuts]);
}

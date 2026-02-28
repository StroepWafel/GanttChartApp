import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onNewTask?: () => void;
  onFocusSearch?: () => void;
  onEscape?: () => void;
  onShowShortcuts?: () => void;
  onShowCompleted?: () => void;
  onShowSettings?: () => void;
  onShowCategories?: () => void;
  enabled?: boolean;
}

function isShortcutAllowed(e: KeyboardEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

function isInputFocused(e: KeyboardEvent): boolean {
  const el = e.target;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function useKeyboardShortcuts({
  onNewTask,
  onFocusSearch,
  onEscape,
  onShowShortcuts,
  onShowCompleted,
  onShowSettings,
  onShowCategories,
  enabled = true,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused(e) && e.key !== 'Escape' && e.key !== '?') return;
      switch (e.key) {
        case 'n':
        case 'N':
          if (isShortcutAllowed(e)) { onNewTask?.(); e.preventDefault(); }
          break;
        case 's':
        case 'S':
          if (isShortcutAllowed(e)) { onFocusSearch?.(); e.preventDefault(); }
          break;
        case 'c':
        case 'C':
          if (isShortcutAllowed(e)) { onShowCompleted?.(); e.preventDefault(); }
          break;
        case ',':
          if (isShortcutAllowed(e)) { onShowSettings?.(); e.preventDefault(); }
          break;
        case 'g':
        case 'G':
          if (isShortcutAllowed(e)) { onShowCategories?.(); e.preventDefault(); }
          break;
        case '/':
          if (isShortcutAllowed(e)) { onFocusSearch?.(); e.preventDefault(); }
          break;
        case 'Escape':
          onEscape?.();
          break;
        case '?':
          if (e.shiftKey) { onShowShortcuts?.(); e.preventDefault(); }
          break;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onNewTask, onFocusSearch, onEscape, onShowShortcuts, onShowCompleted, onShowSettings, onShowCategories]);
}

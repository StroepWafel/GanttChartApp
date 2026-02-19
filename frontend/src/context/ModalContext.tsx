import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';

interface AlertOptions {
  title?: string;
  message: ReactNode;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface ModalContextValue {
  showAlert: (opts: AlertOptions) => Promise<void>;
  showConfirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<AlertOptions | null>(null);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const alertResolveRef = useRef<(() => void) | null>(null);

  const showAlert = useCallback((opts: AlertOptions) => {
    return new Promise<void>((resolve) => {
      alertResolveRef.current = resolve;
      setAlertState(opts);
    });
  }, []);

  const showConfirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...opts,
        resolve,
      });
    });
  }, []);

  const handleAlertClose = useCallback(() => {
    alertResolveRef.current?.();
    alertResolveRef.current = null;
    setAlertState(null);
  }, []);

  const handleConfirmConfirm = useCallback(() => {
    confirmState?.resolve(true);
    setConfirmState(null);
  }, [confirmState]);

  const handleConfirmCancel = useCallback(() => {
    confirmState?.resolve(false);
    setConfirmState(null);
  }, [confirmState]);

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {alertState && (
        <AlertModal
          title={alertState.title}
          message={alertState.message}
          onClose={handleAlertClose}
        />
      )}
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          variant={confirmState.variant}
          onConfirm={handleConfirmConfirm}
          onCancel={handleConfirmCancel}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}

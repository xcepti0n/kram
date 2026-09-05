/**
 * Toasts, and the undo affordance that replaces confirmation dialogs (DD-7).
 *
 * A destructive action fires immediately and offers Undo here. Confirmation
 * dialogs tax every action to guard against a rare mistake; undo taxes none and
 * still recovers.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onAction: () => void | Promise<void>;
}

interface ToastRecord {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

/** Errors stay longer — they are read, not just noticed. */
const DURATION: Record<ToastKind, number> = { info: 6000, success: 3500, error: 9000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info', action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, kind, action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[kind]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      for (const timer of currentTimers.values()) clearTimeout(timer);
      currentTimers.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite" data-testid="toast-region">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast} data-kind={toast.kind}>
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  void toast.action!.onAction();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

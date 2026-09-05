import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Toasts, and the undo affordance that replaces confirmation dialogs (DD-7).
 *
 * A destructive action fires immediately and offers Undo here. Confirmation
 * dialogs tax every action to guard against a rare mistake; undo taxes none and
 * still recovers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from 'react';
import styles from './Toast.module.css';
const ToastContext = createContext(null);
export function useToast() {
    const context = useContext(ToastContext);
    if (!context)
        throw new Error('useToast must be used inside <ToastProvider>');
    return context;
}
/** Errors stay longer — they are read, not just noticed. */
const DURATION = { info: 6000, success: 3500, error: 9000 };
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);
    const timers = useRef(new Map());
    const dismiss = useCallback((id) => {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setToasts((current) => current.filter((t) => t.id !== id));
    }, []);
    const show = useCallback((message, kind = 'info', action) => {
        const id = nextId.current++;
        setToasts((current) => [...current, { id, message, kind, action }]);
        timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]));
    }, [dismiss]);
    useEffect(() => {
        const currentTimers = timers.current;
        return () => {
            for (const timer of currentTimers.values())
                clearTimeout(timer);
            currentTimers.clear();
        };
    }, []);
    const api = useMemo(() => ({ show }), [show]);
    return (_jsxs(ToastContext.Provider, { value: api, children: [children, _jsx("div", { className: styles.region, role: "status", "aria-live": "polite", "data-testid": "toast-region", children: toasts.map((toast) => (_jsxs("div", { className: styles.toast, "data-kind": toast.kind, children: [_jsx("span", { className: styles.message, children: toast.message }), toast.action && (_jsx("button", { type: "button", className: styles.action, onClick: () => {
                                void toast.action.onAction();
                                dismiss(toast.id);
                            }, children: toast.action.label })), _jsx("button", { type: "button", className: styles.close, onClick: () => dismiss(toast.id), "aria-label": "Dismiss", children: _jsx("svg", { viewBox: "0 0 16 16", width: "13", height: "13", "aria-hidden": "true", children: _jsx("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) }) })] }, toast.id))) })] }));
}
//# sourceMappingURL=Toast.js.map
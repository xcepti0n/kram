import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Status control (FR-4.1). One click opens the menu, a second picks — the
 * two-interaction budget the friction requirement allows.
 *
 * Status is conveyed by label as well as colour, so it never depends on hue
 * alone.
 */
import { useEffect, useRef, useState } from 'react';
import { TASK_STATUSES } from '@tasktracker/shared';
import styles from './StatusChip.module.css';
export const STATUS_LABEL = {
    todo: 'To do',
    in_progress: 'In progress',
    blocked: 'Blocked',
    done: 'Done',
};
export function StatusChip({ status, onChange, size = 'sm' }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const close = (event) => {
            if (!rootRef.current?.contains(event.target))
                setOpen(false);
        };
        const onEscape = (event) => {
            if (event.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', onEscape);
        };
    }, [open]);
    return (_jsxs("div", { className: styles.root, ref: rootRef, children: [_jsxs("button", { type: "button", className: styles.chip, "data-status": status, "data-size": size, onClick: (event) => {
                    event.stopPropagation();
                    setOpen((v) => !v);
                }, "aria-haspopup": "listbox", "aria-expanded": open, "aria-label": `Status: ${STATUS_LABEL[status]}. Change status`, "data-testid": "status-chip", children: [_jsx("span", { className: styles.dot, "aria-hidden": "true" }), _jsx("span", { className: styles.label, children: STATUS_LABEL[status] })] }), open && (_jsx("div", { className: styles.menu, role: "listbox", "data-testid": "status-menu", children: TASK_STATUSES.map((option) => (_jsxs("button", { type: "button", role: "option", "aria-selected": option === status, className: styles.option, "data-status": option, "data-selected": option === status || undefined, onClick: (event) => {
                        event.stopPropagation();
                        onChange(option);
                        setOpen(false);
                    }, "data-testid": `status-option-${option}`, children: [_jsx("span", { className: styles.dot, "aria-hidden": "true" }), STATUS_LABEL[option]] }, option))) }))] }));
}
//# sourceMappingURL=StatusChip.js.map
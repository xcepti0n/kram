import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Date field accepting typed natural input (FR-10.6).
 *
 * Backs every date in the app. Typing beats picking for the common cases —
 * "yesterday" is three keystrokes with autocomplete, where a calendar is a click,
 * a scan and another click. The picker stays available for browsing.
 *
 * Unparsed input keeps the previous value and marks the field rather than
 * guessing, so a typo never silently changes a date.
 */
import { useEffect, useRef, useState } from 'react';
import { addDays, formatDate, isIsoDate, parseDateInput, today } from '@tasktracker/shared';
import styles from './DateInput.module.css';
export function DateInput({ value, onChange, label, inline = false, autoFocus = false, className, 'data-testid': testId, }) {
    const [editing, setEditing] = useState(!inline);
    const [draft, setDraft] = useState('');
    const [invalid, setInvalid] = useState(false);
    const inputRef = useRef(null);
    const pickerRef = useRef(null);
    useEffect(() => {
        if (editing && inline) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing, inline]);
    const startEditing = () => {
        setDraft(value);
        setEditing(true);
    };
    const commit = (raw) => {
        const trimmed = raw.trim();
        if (trimmed === '') {
            setInvalid(false);
            if (inline)
                setEditing(false);
            return true;
        }
        const parsed = parseDateInput(trimmed);
        if (parsed) {
            setInvalid(false);
            if (parsed !== value)
                onChange(parsed);
            if (inline)
                setEditing(false);
            return true;
        }
        setInvalid(true);
        return false;
    };
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setInvalid(false);
            setDraft(value);
            if (inline)
                setEditing(false);
            return;
        }
        // Arrow keys step by a day, which is faster than retyping for small nudges.
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const base = isIsoDate(draft) ? draft : (parseDateInput(draft) ?? value);
            const next = addDays(base, event.key === 'ArrowUp' ? 1 : -1);
            setDraft(next);
            setInvalid(false);
            onChange(next);
        }
    };
    if (inline && !editing) {
        return (_jsx("button", { type: "button", className: `${styles.inlineValue} ${className ?? ''}`, onClick: startEditing, "data-testid": testId, children: formatDate(value) }));
    }
    return (_jsxs("div", { className: `${styles.wrapper} ${inline ? styles.inline : ''} ${className ?? ''}`, children: [label && _jsx("label", { className: styles.label, children: label }), _jsxs("div", { className: styles.field, "data-invalid": invalid || undefined, children: [_jsx("input", { ref: inputRef, type: "text", className: styles.input, value: editing ? draft : value, placeholder: "today, 3 Aug, 12/8\u2026", autoFocus: autoFocus, onFocus: () => {
                            if (!editing)
                                setDraft(value);
                            setEditing(true);
                        }, onChange: (event) => {
                            setDraft(event.target.value);
                            if (invalid)
                                setInvalid(false);
                        }, onKeyDown: handleKeyDown, onBlur: () => {
                            if (!commit(draft) && inline) {
                                // Keep an unparsed value visible so the mistake is correctable.
                                setDraft(value);
                                setInvalid(false);
                                setEditing(false);
                            }
                        }, "aria-label": label ?? 'Date', "aria-invalid": invalid || undefined, "data-testid": testId }), _jsx("button", { type: "button", className: styles.pickerButton, onClick: () => pickerRef.current?.showPicker(), "aria-label": "Open calendar", tabIndex: -1, children: _jsxs("svg", { viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true", children: [_jsx("rect", { x: "2", y: "3", width: "12", height: "11", rx: "2", fill: "none", stroke: "currentColor", strokeWidth: "1.3" }), _jsx("path", { d: "M2 6.5h12M5.5 2v2M10.5 2v2", stroke: "currentColor", strokeWidth: "1.3" })] }) }), _jsx("input", { ref: pickerRef, type: "date", className: styles.nativePicker, value: isIsoDate(value) ? value : today(), onChange: (event) => {
                            if (event.target.value) {
                                setDraft(event.target.value);
                                onChange(event.target.value);
                                setInvalid(false);
                                if (inline)
                                    setEditing(false);
                            }
                        }, tabIndex: -1, "aria-hidden": "true" })] }), invalid && _jsx("span", { className: styles.hint, children: "Try \"yesterday\", \"3 Aug\" or \"12/8\"" })] }));
}
//# sourceMappingURL=DateInput.js.map
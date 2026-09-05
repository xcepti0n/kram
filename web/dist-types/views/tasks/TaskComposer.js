import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Inline task composer, permanently present at the foot of every list (FR-10.2).
 *
 * Type a title, press Enter, done — and the field stays focused so several tasks
 * can be captured in a row without reaching for the mouse.
 */
import { useRef, useState } from 'react';
import styles from './TaskComposer.module.css';
export function TaskComposer({ onCreate, placeholder, autoFocus }) {
    const [title, setTitle] = useState('');
    const inputRef = useRef(null);
    const submit = () => {
        const trimmed = title.trim();
        if (!trimmed)
            return;
        onCreate(trimmed);
        setTitle('');
        inputRef.current?.focus();
    };
    return (_jsxs("div", { className: styles.composer, children: [_jsx("span", { className: styles.plus, "aria-hidden": "true", children: _jsx("svg", { viewBox: "0 0 14 14", width: "13", height: "13", children: _jsx("path", { d: "M7 2v10M2 7h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) }) }), _jsx("input", { ref: inputRef, type: "text", className: styles.input, value: title, placeholder: placeholder ?? 'Add a task', autoFocus: autoFocus, onChange: (event) => setTitle(event.target.value), onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        submit();
                    }
                    else if (event.key === 'Escape') {
                        setTitle('');
                        inputRef.current?.blur();
                    }
                }, "aria-label": "New task title", "data-testid": "task-composer" }), title.trim() && (_jsx("button", { type: "button", className: styles.submit, onClick: submit, children: "Add" }))] }));
}
//# sourceMappingURL=TaskComposer.js.map
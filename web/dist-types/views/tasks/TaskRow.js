import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDate } from '@tasktracker/shared';
import { StatusChip } from '../../components/StatusChip.js';
import styles from './TaskRow.module.css';
export function TaskRow({ task, pageColour, pageName, placeName, draggable, selected, onSelect, onStatusChange, onDelete, }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.id,
        disabled: !draggable,
    });
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };
    const isDone = task.status === 'done';
    return (_jsxs("li", { ref: setNodeRef, style: style, className: styles.row, "data-dragging": isDragging || undefined, "data-selected": selected || undefined, "data-done": isDone || undefined, "data-testid": `task-row-${task.title}`, onClick: () => onSelect(task.id), children: [draggable && (_jsx("button", { type: "button", className: styles.handle, ...attributes, ...listeners, "aria-label": `Reorder ${task.title}`, onClick: (event) => event.stopPropagation(), "data-testid": `drag-handle-${task.title}`, children: _jsxs("svg", { viewBox: "0 0 10 16", width: "10", height: "16", "aria-hidden": "true", children: [_jsx("circle", { cx: "3", cy: "4", r: "1.3", fill: "currentColor" }), _jsx("circle", { cx: "3", cy: "8", r: "1.3", fill: "currentColor" }), _jsx("circle", { cx: "3", cy: "12", r: "1.3", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "4", r: "1.3", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "8", r: "1.3", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "12", r: "1.3", fill: "currentColor" })] }) })), _jsx("button", { type: "button", className: styles.checkbox, "data-checked": isDone || undefined, onClick: (event) => {
                    event.stopPropagation();
                    onStatusChange(task.id, isDone ? 'todo' : 'done');
                }, "aria-label": isDone ? `Reopen ${task.title}` : `Complete ${task.title}`, "data-testid": `complete-${task.title}`, children: isDone && (_jsx("svg", { viewBox: "0 0 14 14", width: "11", height: "11", "aria-hidden": "true", children: _jsx("path", { d: "M2.5 7.5l3 3 6-7", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) })) }), _jsx("span", { className: styles.colour, style: { background: task.colour }, "aria-hidden": "true" }), _jsx("span", { className: styles.title, children: task.title }), _jsxs("div", { className: styles.meta, children: [(placeName ?? task.location_label) && (_jsxs("span", { className: styles.location, title: placeName ?? task.location_label ?? '', children: [_jsxs("svg", { viewBox: "0 0 12 14", width: "10", height: "11", "aria-hidden": "true", children: [_jsx("path", { d: "M6 13S1.5 8.5 1.5 5.5a4.5 4.5 0 019 0C10.5 8.5 6 13 6 13z", fill: "none", stroke: "currentColor", strokeWidth: "1.3" }), _jsx("circle", { cx: "6", cy: "5.4", r: "1.6", fill: "currentColor" })] }), placeName ?? task.location_label] })), pageName && (_jsxs("span", { className: styles.page, children: [_jsx("span", { className: styles.pageDot, style: { background: pageColour }, "aria-hidden": "true" }), pageName] })), _jsx("span", { className: styles.date, children: formatDate(task.created_on) }), _jsx(StatusChip, { status: task.status, onChange: (status) => onStatusChange(task.id, status) }), _jsx("button", { type: "button", className: styles.delete, onClick: (event) => {
                            event.stopPropagation();
                            onDelete(task);
                        }, "aria-label": `Delete ${task.title}`, "data-testid": `delete-${task.title}`, children: _jsx("svg", { viewBox: "0 0 14 14", width: "12", height: "12", "aria-hidden": "true", children: _jsx("path", { d: "M2.5 4h9M5.5 4V2.8h3V4M4 4l.5 7.5h5L10 4", fill: "none", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" }) }) })] })] }));
}
//# sourceMappingURL=TaskRow.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './Sidebar.module.css';
/** A draggable page in the sidebar. Pages carry a `position` exactly as tasks
 *  do, so the same neighbour-id reorder applies (FR-6.2). */
export function SidebarPage({ page, active, onNavigate, onStartRename }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: page.id,
    });
    return (_jsxs("li", { ref: setNodeRef, style: { transform: CSS.Translate.toString(transform), transition }, "data-dragging": isDragging || undefined, className: styles.pageItem, children: [_jsxs("button", { type: "button", className: styles.item, "data-active": active || undefined, onClick: onNavigate, onDoubleClick: onStartRename, "data-testid": `nav-page-${page.name}`, children: [_jsx("span", { className: styles.dot, style: { background: page.colour }, "aria-hidden": "true" }), _jsx("span", { className: styles.itemLabel, children: page.name })] }), _jsx("button", { type: "button", className: styles.pageHandle, ...attributes, ...listeners, "aria-label": `Reorder ${page.name}`, "data-testid": `page-handle-${page.name}`, children: _jsxs("svg", { viewBox: "0 0 10 16", width: "9", height: "14", "aria-hidden": "true", children: [_jsx("circle", { cx: "3", cy: "4", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "3", cy: "8", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "3", cy: "12", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "4", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "8", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "12", r: "1.2", fill: "currentColor" })] }) })] }));
}
//# sourceMappingURL=SidebarPage.js.map
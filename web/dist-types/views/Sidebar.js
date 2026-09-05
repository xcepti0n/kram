import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, } from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, } from '@dnd-kit/sortable';
import { SidebarPage } from './SidebarPage.js';
import styles from './Sidebar.module.css';
export function Sidebar({ pages, view, onNavigate, onCreatePage, onRenamePage, onReorderPage, open, onClose, }) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [renaming, setRenaming] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [localOrder, setLocalOrder] = useState(null);
    const swipeStart = useRef(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    /* The list settles locally on drop while the write is in flight; the query
       invalidation reconciles it afterwards. */
    const ordered = useMemo(() => {
        if (!localOrder)
            return pages;
        const byId = new Map(pages.map((p) => [p.id, p]));
        const out = localOrder.map((id) => byId.get(id)).filter((p) => Boolean(p));
        for (const page of pages)
            if (!localOrder.includes(page.id))
                out.push(page);
        return out;
    }, [pages, localOrder]);
    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id)
            return;
        const from = ordered.findIndex((p) => p.id === active.id);
        const to = ordered.findIndex((p) => p.id === over.id);
        if (from < 0 || to < 0)
            return;
        const next = [...ordered];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setLocalOrder(next.map((p) => p.id));
        onReorderPage(String(active.id), next[to - 1]?.id ?? null, next[to + 1]?.id ?? null);
    };
    const isActive = (candidate) => {
        if (candidate.kind !== view.kind)
            return false;
        if (candidate.kind === 'page' && view.kind === 'page')
            return candidate.id === view.id;
        return true;
    };
    const submitNew = () => {
        const trimmed = newName.trim();
        if (trimmed)
            onCreatePage(trimmed);
        setNewName('');
        setCreating(false);
    };
    return (_jsxs(_Fragment, { children: [open && _jsx("div", { className: styles.scrim, onClick: onClose, "aria-hidden": "true" }), _jsxs("nav", { className: styles.sidebar, "data-open": open || undefined, "aria-label": "Views and pages", onTouchStart: (event) => {
                    const touch = event.touches[0];
                    if (touch)
                        swipeStart.current = { x: touch.clientX, y: touch.clientY };
                }, onTouchEnd: (event) => {
                    const start = swipeStart.current;
                    const touch = event.changedTouches[0];
                    swipeStart.current = null;
                    if (!start || !touch)
                        return;
                    const dx = touch.clientX - start.x;
                    const dy = Math.abs(touch.clientY - start.y);
                    // A decisive leftward swipe closes it; vertical movement means the
                    // user was scrolling the page list instead.
                    if (dx < -55 && dy < 45)
                        onClose();
                }, children: [_jsxs("div", { className: styles.brand, children: [_jsx("span", { className: styles.mark, "aria-hidden": "true", children: _jsxs("svg", { viewBox: "0 0 20 20", width: "17", height: "17", children: [_jsx("path", { d: "M3 6h6M3 10h10M3 14h7", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), _jsx("circle", { cx: "16", cy: "6", r: "2.2", fill: "currentColor" })] }) }), "TaskTracker"] }), _jsxs("ul", { className: styles.group, children: [_jsx("li", { children: _jsxs("button", { type: "button", className: styles.item, "data-active": isActive({ kind: 'overview' }) || undefined, onClick: () => onNavigate({ kind: 'overview' }), "data-testid": "nav-overview", children: [_jsx(Glyph, { name: "overview" }), "Overview"] }) }), _jsx("li", { children: _jsxs("button", { type: "button", className: styles.item, "data-active": isActive({ kind: 'timeline' }) || undefined, onClick: () => onNavigate({ kind: 'timeline' }), "data-testid": "nav-timeline", children: [_jsx(Glyph, { name: "timeline" }), "Timeline"] }) })] }), _jsxs("div", { className: styles.sectionHeader, children: [_jsx("span", { children: "Pages" }), _jsx("button", { type: "button", className: styles.addPage, onClick: () => setCreating(true), "aria-label": "New page", "data-testid": "new-page", children: _jsx("svg", { viewBox: "0 0 14 14", width: "12", height: "12", "aria-hidden": "true", children: _jsx("path", { d: "M7 2v10M2 7h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) }) })] }), _jsx(DndContext, { sensors: sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, modifiers: [restrictToVerticalAxis, restrictToParentElement], children: _jsx(SortableContext, { items: ordered.map((p) => p.id), strategy: verticalListSortingStrategy, children: _jsx("ul", { className: styles.group, "data-testid": "page-list", children: ordered.map((page) => renaming === page.id ? (_jsx("li", { children: _jsx("input", { className: styles.renameInput, value: renameValue, autoFocus: true, onChange: (event) => setRenameValue(event.target.value), onBlur: () => {
                                            const trimmed = renameValue.trim();
                                            if (trimmed && trimmed !== page.name)
                                                onRenamePage(page.id, trimmed);
                                            setRenaming(null);
                                        }, onKeyDown: (event) => {
                                            if (event.key === 'Enter')
                                                event.target.blur();
                                            else if (event.key === 'Escape')
                                                setRenaming(null);
                                        } }) }, page.id)) : (_jsx(SidebarPage, { page: page, active: isActive({ kind: 'page', id: page.id }), onNavigate: () => onNavigate({ kind: 'page', id: page.id }), onStartRename: () => {
                                        setRenaming(page.id);
                                        setRenameValue(page.name);
                                    } }, page.id))) }) }) }), _jsx("ul", { className: styles.group, children: creating && (_jsx("li", { children: _jsx("input", { className: styles.renameInput, value: newName, placeholder: "Page name", autoFocus: true, onChange: (event) => setNewName(event.target.value), onBlur: submitNew, onKeyDown: (event) => {
                                    if (event.key === 'Enter')
                                        submitNew();
                                    else if (event.key === 'Escape') {
                                        setNewName('');
                                        setCreating(false);
                                    }
                                }, "data-testid": "new-page-input" }) })) }), _jsx("div", { className: styles.footer, children: _jsxs("button", { type: "button", className: styles.item, "data-active": isActive({ kind: 'settings' }) || undefined, onClick: () => onNavigate({ kind: 'settings' }), "data-testid": "nav-settings", children: [_jsx(Glyph, { name: "settings" }), "Settings"] }) })] })] }));
}
function Glyph({ name }) {
    const paths = {
        overview: (_jsxs(_Fragment, { children: [_jsx("rect", { x: "2.5", y: "3", width: "11", height: "3", rx: "1", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }), _jsx("rect", { x: "2.5", y: "9", width: "11", height: "4", rx: "1", fill: "none", stroke: "currentColor", strokeWidth: "1.4" })] })),
        timeline: (_jsxs(_Fragment, { children: [_jsx("path", { d: "M2.5 5h7M2.5 11h11", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }), _jsx("circle", { cx: "6", cy: "5", r: "1.8", fill: "currentColor" }), _jsx("circle", { cx: "10.5", cy: "11", r: "1.8", fill: "currentColor" })] })),
        settings: (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "8", cy: "8", r: "2.2", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }), _jsx("path", { d: "M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" })] })),
    };
    return (_jsx("svg", { viewBox: "0 0 16 16", width: "15", height: "15", className: styles.glyph, "aria-hidden": "true", children: paths[name] }));
}
//# sourceMappingURL=Sidebar.js.map
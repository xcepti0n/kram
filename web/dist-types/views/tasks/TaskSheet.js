import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Task detail, as a side sheet rather than a modal so the surrounding context
 * stays visible (FR-10.4).
 *
 * Every field saves on blur — there are no save buttons (FR-10.3).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, PALETTE, TASK_STATUSES, } from '@tasktracker/shared';
import { DateInput } from '../../components/DateInput.js';
import { PlacePicker } from '../../components/PlacePicker.js';
import { STATUS_LABEL, StatusChip } from '../../components/StatusChip.js';
import styles from './TaskSheet.module.css';
export function TaskSheet({ task, pageName, places, onCreatePlace, onClose, onUpdate, onStatusChange, onAddUpdate, onEditUpdate, onDeleteUpdate, onEditStatusEvent, }) {
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description ?? '');
    const [updateBody, setUpdateBody] = useState('');
    const [updateDate, setUpdateDate] = useState(todayString());
    const [updateStatus, setUpdateStatus] = useState('');
    const [editingUpdate, setEditingUpdate] = useState(null);
    const [editingBody, setEditingBody] = useState('');
    const [dragY, setDragY] = useState(0);
    const dragStart = useRef(null);
    const scrollRef = useRef(null);
    useEffect(() => {
        setTitle(task.title);
        setDescription(task.description ?? '');
    }, [task.id, task.title, task.description]);
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    /* Notes and state changes are separate rows but one narrative, so the sheet
       interleaves them chronologically (DD-16). */
    const entries = useMemo(() => {
        const merged = [
            ...task.updates.map((update) => ({
                kind: 'update',
                at: update.occurred_on,
                update,
            })),
            ...task.status_events.map((event) => ({
                kind: 'event',
                at: event.occurred_on,
                event,
            })),
        ];
        return merged.sort((a, b) => b.at.localeCompare(a.at) || (a.kind === 'event' ? 1 : -1));
    }, [task.updates, task.status_events]);
    /* Drag-to-dismiss on touch. Only starts when the content is scrolled to the
       top, so pulling down to read never closes the sheet by accident. */
    const onGrabberDown = (event) => {
        if ((scrollRef.current?.scrollTop ?? 0) > 0)
            return;
        dragStart.current = event.clientY;
        event.target.setPointerCapture?.(event.pointerId);
    };
    const onGrabberMove = (event) => {
        if (dragStart.current === null)
            return;
        setDragY(Math.max(0, event.clientY - dragStart.current));
    };
    const onGrabberUp = () => {
        if (dragStart.current === null)
            return;
        // Past a third of the way down, the gesture reads as "dismiss".
        if (dragY > 120)
            onClose();
        dragStart.current = null;
        setDragY(0);
    };
    const submitUpdate = () => {
        const trimmed = updateBody.trim();
        if (!trimmed)
            return;
        onAddUpdate(trimmed, updateDate, updateStatus || undefined);
        setUpdateBody('');
        setUpdateDate(todayString());
        setUpdateStatus('');
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: styles.scrim, onClick: onClose, "aria-hidden": "true" }), _jsxs("aside", { className: styles.sheet, role: "dialog", "aria-label": task.title, "data-testid": "task-sheet", style: dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined, children: [_jsx("div", { className: styles.grabber, onPointerDown: onGrabberDown, onPointerMove: onGrabberMove, onPointerUp: onGrabberUp, onPointerCancel: onGrabberUp, "data-testid": "sheet-grabber", "aria-hidden": "true", children: _jsx("span", {}) }), _jsxs("header", { className: styles.header, children: [pageName && _jsx("span", { className: styles.page, children: pageName }), _jsx("button", { type: "button", className: styles.close, onClick: onClose, "aria-label": "Close", "data-testid": "sheet-close", children: _jsx("svg", { viewBox: "0 0 16 16", width: "15", height: "15", "aria-hidden": "true", children: _jsx("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) }) })] }), _jsxs("div", { className: styles.body, ref: scrollRef, children: [_jsx("textarea", { className: styles.title, value: title, rows: 1, onChange: (event) => setTitle(event.target.value), onBlur: () => {
                                    const trimmed = title.trim();
                                    if (trimmed && trimmed !== task.title)
                                        onUpdate({ title: trimmed });
                                    else if (!trimmed)
                                        setTitle(task.title);
                                }, "aria-label": "Task title", "data-testid": "sheet-title" }), _jsxs("div", { className: styles.fields, children: [_jsxs("div", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: "Status" }), _jsx(StatusChip, { status: task.status, onChange: (s) => onStatusChange(s), size: "md" })] }), _jsxs("div", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: "Started" }), _jsx(DateInput, { value: task.created_on, onChange: (value) => onUpdate({ created_on: value }), inline: true, "data-testid": "sheet-created-on" })] }), task.completed_on && (_jsxs("div", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: "Completed" }), _jsx("span", { className: styles.fieldValue, children: formatDate(task.completed_on) })] })), _jsxs("div", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: "Colour" }), _jsx("div", { className: styles.swatches, children: PALETTE.map((colour) => (_jsx("button", { type: "button", className: styles.swatch, style: { background: colour }, "data-selected": colour.toLowerCase() === task.colour.toLowerCase() || undefined, onClick: () => onUpdate({ colour }), "aria-label": `Colour ${colour}` }, colour))) })] })] }), _jsx("textarea", { className: styles.description, value: description, placeholder: "Notes about this task\u2026", rows: 3, onChange: (event) => setDescription(event.target.value), onBlur: () => {
                                    if (description !== (task.description ?? '')) {
                                        onUpdate({ description: description || null });
                                    }
                                }, "aria-label": "Description", "data-testid": "sheet-description" }), _jsxs("div", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: "Place" }), _jsx("div", { className: styles.placeField, children: _jsx(PlacePicker, { places: places, selectedId: task.place_id, onSelect: (place_id) => onUpdate({ place_id }), onCreate: onCreatePlace }) })] }), _jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.sectionTitle, children: "Progress" }), _jsxs("div", { className: styles.updateComposer, children: [_jsx("textarea", { className: styles.updateInput, value: updateBody, placeholder: "What happened?", rows: 2, onChange: (event) => setUpdateBody(event.target.value), onKeyDown: (event) => {
                                                    // Enter submits; Shift+Enter adds a line. The common case is
                                                    // one line, so it gets the single keystroke (FR-3.4).
                                                    if (event.key === 'Enter' && !event.shiftKey) {
                                                        event.preventDefault();
                                                        submitUpdate();
                                                    }
                                                }, "aria-label": "New status update", "data-testid": "update-composer" }), _jsxs("div", { className: styles.updateControls, children: [_jsx(DateInput, { value: updateDate, onChange: setUpdateDate, inline: true }), _jsxs("select", { className: styles.statusSelect, value: updateStatus, onChange: (event) => setUpdateStatus(event.target.value), "aria-label": "Also change status", "data-testid": "update-status-select", children: [_jsx("option", { value: "", children: "Keep status" }), TASK_STATUSES.filter((s) => s !== task.status).map((status) => (_jsxs("option", { value: status, children: ["\u2192 ", STATUS_LABEL[status]] }, status)))] }), _jsx("button", { type: "button", className: styles.updateSubmit, onClick: submitUpdate, disabled: !updateBody.trim(), "data-testid": "update-submit", children: "Add" })] })] }), _jsxs("ol", { className: styles.entries, "data-testid": "task-history", children: [entries.length === 0 && _jsx("li", { className: styles.emptyEntry, children: "No progress recorded yet." }), entries.map((entry) => entry.kind === 'update' ? (_jsxs("li", { className: styles.entry, "data-testid": "history-update", children: [_jsx("span", { className: styles.entryDot, style: { background: task.colour } }), _jsxs("div", { className: styles.entryBody, children: [editingUpdate === entry.update.id ? (_jsx("textarea", { className: styles.entryEdit, value: editingBody, rows: 2, autoFocus: true, onChange: (event) => setEditingBody(event.target.value), onBlur: () => {
                                                                    const trimmed = editingBody.trim();
                                                                    if (trimmed && trimmed !== entry.update.body) {
                                                                        onEditUpdate(entry.update.id, { body: trimmed });
                                                                    }
                                                                    setEditingUpdate(null);
                                                                }, onKeyDown: (event) => {
                                                                    if (event.key === 'Enter' && !event.shiftKey) {
                                                                        event.preventDefault();
                                                                        event.target.blur();
                                                                    }
                                                                    else if (event.key === 'Escape') {
                                                                        setEditingUpdate(null);
                                                                    }
                                                                } })) : (_jsx("p", { className: styles.entryText, onClick: () => {
                                                                    setEditingUpdate(entry.update.id);
                                                                    setEditingBody(entry.update.body);
                                                                }, children: entry.update.body })), _jsxs("div", { className: styles.entryMeta, children: [_jsx(DateInput, { value: entry.update.occurred_on, onChange: (value) => onEditUpdate(entry.update.id, { occurred_on: value }), inline: true }), _jsx("button", { type: "button", className: styles.entryDelete, onClick: () => onDeleteUpdate(entry.update.id), "aria-label": "Delete update", "data-testid": "delete-update", children: "Delete" })] })] })] }, entry.update.id)) : (_jsxs("li", { className: styles.eventEntry, "data-testid": "history-event", children: [_jsx("span", { className: styles.eventDot, "data-status": entry.event.status }), _jsx("span", { className: styles.eventLabel, children: STATUS_LABEL[entry.event.status] }), _jsx(DateInput, { value: entry.event.occurred_on, onChange: (value) => onEditStatusEvent(entry.event.id, value), inline: true, className: styles.eventDate })] }, entry.event.id)))] })] })] })] })] }));
}
/* -------------------------------------------------------------------------- */
function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
//# sourceMappingURL=TaskSheet.js.map
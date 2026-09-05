import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Task list with drag-to-reorder (FR-7) and an always-present composer (FR-10.2).
 *
 * Reordering sends neighbour ids rather than an index, so a concurrent change
 * cannot silently misplace the task (DD-6). Drag is disabled under a non-manual
 * sort, since dragging would have nowhere to persist (DD-17).
 */
import { useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, } from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, } from '@dnd-kit/sortable';
import { TaskRow } from './TaskRow.js';
import { TaskComposer } from './TaskComposer.js';
import styles from './TaskList.module.css';
export function TaskList({ tasks, pages, places = [], sort, showPageNames = false, selectedId, onSelect, onStatusChange, onDelete, onReorder, onCreate, composerPlaceholder, }) {
    // Local order lets the list settle instantly on drop while the write is in
    // flight; the query invalidation reconciles it afterwards.
    const [localOrder, setLocalOrder] = useState(null);
    const ordered = useMemo(() => {
        if (!localOrder)
            return tasks;
        const byId = new Map(tasks.map((t) => [t.id, t]));
        const out = localOrder.map((id) => byId.get(id)).filter((t) => Boolean(t));
        // Anything new since the drag (created elsewhere) goes to the end.
        for (const task of tasks)
            if (!localOrder.includes(task.id))
                out.push(task);
        return out;
    }, [tasks, localOrder]);
    const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
    const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
    const draggable = sort === 'manual';
    const sensors = useSensors(
    // A small activation distance keeps a click from starting a drag, which
    // matters on touch where the two are otherwise indistinguishable.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id)
            return;
        const oldIndex = ordered.findIndex((t) => t.id === active.id);
        const newIndex = ordered.findIndex((t) => t.id === over.id);
        if (oldIndex < 0 || newIndex < 0)
            return;
        const next = [...ordered];
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);
        setLocalOrder(next.map((t) => t.id));
        // Neighbours in the *new* arrangement, excluding the moved task itself.
        const before = next[newIndex - 1]?.id ?? null;
        const after = next[newIndex + 1]?.id ?? null;
        onReorder(String(active.id), before, after);
    };
    return (_jsxs("div", { className: styles.root, children: [ordered.length === 0 ? (_jsx("p", { className: styles.empty, children: "Nothing here yet. Add the first task below." })) : (_jsx(DndContext, { sensors: sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, modifiers: [restrictToVerticalAxis, restrictToParentElement], children: _jsx(SortableContext, { items: ordered.map((t) => t.id), strategy: verticalListSortingStrategy, children: _jsx("ul", { className: styles.list, "data-testid": "task-list", children: ordered.map((task) => {
                            const page = pageById.get(task.page_id);
                            return (_jsx(TaskRow, { task: task, pageColour: page?.colour, pageName: showPageNames ? page?.name : undefined, placeName: task.place_id ? placeById.get(task.place_id)?.name : undefined, draggable: draggable, selected: task.id === selectedId, onSelect: onSelect, onStatusChange: onStatusChange, onDelete: onDelete }, task.id));
                        }) }) }) })), _jsx(TaskComposer, { onCreate: onCreate, placeholder: composerPlaceholder })] }));
}
//# sourceMappingURL=TaskList.js.map
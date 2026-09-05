import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Place picker (DD-23).
 *
 * A place is somewhere you return to, so the interaction is *choose*, not
 * *describe*: type to filter what you already have, and only fall through to
 * creating one when nothing matches. "Use where I am" saves the current
 * position, which is both simpler and more accurate than geocoding an address
 * you are standing in (DD-24).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PlacePicker.module.css';
export function PlacePicker({ places, selectedId, onSelect, onCreate }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [locating, setLocating] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const rootRef = useRef(null);
    const inputRef = useRef(null);
    const selected = places.find((p) => p.id === selectedId) ?? null;
    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? places.filter((p) => p.name.toLowerCase().includes(q)) : places;
        // Most-used first: the place you attach tasks to most is the one you want.
        return [...list].sort((a, b) => b.task_count - a.task_count || a.name.localeCompare(b.name));
    }, [places, query]);
    const exactMatch = matches.some((p) => p.name.toLowerCase() === query.trim().toLowerCase());
    const canCreate = query.trim().length > 0 && !exactMatch;
    useEffect(() => {
        if (!open)
            return;
        const onClickOutside = (event) => {
            if (!rootRef.current?.contains(event.target))
                setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);
    useEffect(() => {
        if (open)
            inputRef.current?.focus();
        else {
            setQuery('');
            setHighlight(0);
        }
    }, [open]);
    const choose = (place) => {
        onSelect(place.id);
        setOpen(false);
    };
    const createFromQuery = async () => {
        const name = query.trim();
        if (!name)
            return;
        const created = await onCreate(name);
        if (created)
            onSelect(created.id);
        setOpen(false);
    };
    /** Save the current position. Permission is asked for here, on an explicit
     *  action, never on load. */
    const useCurrentPosition = () => {
        if (!navigator.geolocation)
            return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(async (position) => {
            const coords = {
                lat: Number(position.coords.latitude.toFixed(6)),
                lng: Number(position.coords.longitude.toFixed(6)),
            };
            const name = query.trim() || 'Here';
            const created = await onCreate(name, coords);
            if (created)
                onSelect(created.id);
            setLocating(false);
            setOpen(false);
        }, () => setLocating(false), { timeout: 10_000, enableHighAccuracy: true });
    };
    const options = canCreate ? matches.length + 1 : matches.length;
    const onKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlight((h) => Math.min(h + 1, Math.max(0, options - 1)));
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
        }
        else if (event.key === 'Enter') {
            event.preventDefault();
            if (highlight < matches.length) {
                const place = matches[highlight];
                if (place)
                    choose(place);
            }
            else if (canCreate) {
                void createFromQuery();
            }
        }
        else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
        }
    };
    return (_jsx("div", { className: styles.root, ref: rootRef, children: !open ? (_jsxs("div", { className: styles.selectedRow, children: [_jsxs("button", { type: "button", className: styles.trigger, "data-empty": !selected || undefined, onClick: () => setOpen(true), "data-testid": "place-trigger", children: [_jsx(PinIcon, {}), selected ? selected.name : 'Add a place', selected?.lat != null && _jsx("span", { className: styles.hasCoords, title: "Has coordinates" })] }), selected && (_jsx("button", { type: "button", className: styles.clear, onClick: () => onSelect(null), "aria-label": "Remove place", "data-testid": "place-clear", children: _jsx("svg", { viewBox: "0 0 14 14", width: "11", height: "11", "aria-hidden": "true", children: _jsx("path", { d: "M4 4l6 6M10 4l-6 6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) }) }))] })) : (_jsxs("div", { className: styles.picker, children: [_jsxs("div", { className: styles.searchRow, children: [_jsx(PinIcon, {}), _jsx("input", { ref: inputRef, type: "text", className: styles.search, value: query, placeholder: "Find or name a place\u2026", onChange: (event) => {
                                setQuery(event.target.value);
                                setHighlight(0);
                            }, onKeyDown: onKeyDown, "aria-label": "Find or name a place", "data-testid": "place-search" })] }), _jsxs("div", { className: styles.options, role: "listbox", children: [matches.map((place, index) => (_jsxs("button", { type: "button", role: "option", "aria-selected": place.id === selectedId, className: styles.option, "data-highlighted": index === highlight || undefined, "data-selected": place.id === selectedId || undefined, onMouseEnter: () => setHighlight(index), onClick: () => choose(place), "data-testid": `place-option-${place.name}`, children: [_jsx(PinIcon, {}), _jsx("span", { className: styles.optionName, children: place.name }), place.lat != null && _jsx("span", { className: styles.hasCoords, title: "Has coordinates" }), place.task_count > 0 && (_jsx("span", { className: styles.optionCount, children: place.task_count }))] }, place.id))), canCreate && (_jsxs("button", { type: "button", className: styles.option, "data-highlighted": highlight === matches.length || undefined, onMouseEnter: () => setHighlight(matches.length), onClick: () => void createFromQuery(), "data-testid": "place-create", children: [_jsx("span", { className: styles.plus, children: "+" }), _jsxs("span", { className: styles.optionName, children: ["Create \u201C", _jsx("strong", { children: query.trim() }), "\u201D"] })] })), matches.length === 0 && !canCreate && (_jsx("p", { className: styles.empty, children: "No places yet \u2014 type a name to add one." }))] }), _jsxs("button", { type: "button", className: styles.locate, onClick: useCurrentPosition, disabled: locating, "data-testid": "place-use-current", children: [_jsxs("svg", { viewBox: "0 0 14 14", width: "12", height: "12", "aria-hidden": "true", children: [_jsx("circle", { cx: "7", cy: "7", r: "2.4", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "7", r: "5", fill: "none", stroke: "currentColor", strokeWidth: "1.2" }), _jsx("path", { d: "M7 0v2M7 12v2M0 7h2M12 7h2", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round" })] }), locating ? 'Finding you…' : query.trim() ? `Save “${query.trim()}” where I am` : 'Use where I am'] })] })) }));
}
function PinIcon() {
    return (_jsxs("svg", { viewBox: "0 0 12 14", width: "11", height: "12", className: styles.pin, "aria-hidden": "true", children: [_jsx("path", { d: "M6 13S1.5 8.5 1.5 5.5a4.5 4.5 0 019 0C10.5 8.5 6 13 6 13z", fill: "none", stroke: "currentColor", strokeWidth: "1.3" }), _jsx("circle", { cx: "6", cy: "5.4", r: "1.6", fill: "currentColor" })] }));
}
//# sourceMappingURL=PlacePicker.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.js';
import styles from './Settings.module.css';
const THEME_OPTIONS = [
    { value: 'calm', label: 'Calm', hint: 'Restrained, generous whitespace' },
    { value: 'bold', label: 'Bold', hint: 'Saturated, heavier, more motion' },
    { value: 'dense', label: 'Dense', hint: 'Compact, maximum on screen' },
];
const MODE_OPTIONS = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];
const DENSITY_OPTIONS = [
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'compact', label: 'Compact' },
];
export function Settings({ settings, pages, onChange, onImport, onDeletePage }) {
    const fileRef = useRef(null);
    const [importMode, setImportMode] = useState('merge');
    const [pendingPage, setPendingPage] = useState(null);
    const toast = useToast();
    const handleFile = async (file) => {
        try {
            const text = await file.text();
            const doc = JSON.parse(text);
            onImport(doc, importMode);
        }
        catch {
            toast.show('That file is not valid JSON', 'error');
        }
        if (fileRef.current)
            fileRef.current.value = '';
    };
    return (_jsxs("div", { className: styles.root, children: [_jsxs("section", { className: styles.section, children: [_jsx("h2", { className: styles.heading, children: "Appearance" }), _jsx("p", { className: styles.description, children: "A theme changes how the app is laid out, not only its colours \u2014 spacing, type scale and the timeline's own geometry all follow." }), _jsx("div", { className: styles.themeGrid, children: THEME_OPTIONS.map((option) => (_jsxs("button", { type: "button", className: styles.themeCard, "data-selected": settings.theme === option.value || undefined, onClick: () => onChange({ theme: option.value }), "data-testid": `theme-${option.value}`, children: [_jsx(ThemePreview, { variant: option.value }), _jsx("span", { className: styles.themeName, children: option.label }), _jsx("span", { className: styles.themeHint, children: option.hint })] }, option.value))) }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.label, children: "Colour mode" }), _jsx("div", { className: styles.segmented, role: "group", children: MODE_OPTIONS.map((option) => (_jsx("button", { type: "button", className: styles.segment, "data-active": settings.mode === option.value || undefined, onClick: () => onChange({ mode: option.value }), "data-testid": `mode-${option.value}`, children: option.label }, option.value))) })] }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.label, children: "Density" }), _jsx("div", { className: styles.segmented, role: "group", children: DENSITY_OPTIONS.map((option) => (_jsx("button", { type: "button", className: styles.segment, "data-active": settings.density === option.value || undefined, onClick: () => onChange({ density: option.value }), "data-testid": `density-${option.value}`, children: option.label }, option.value))) })] }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.label, children: "Completed tasks" }), _jsxs("label", { className: styles.checkboxRow, children: [_jsx("input", { type: "checkbox", checked: settings.hide_done, onChange: (event) => onChange({ hide_done: event.target.checked }), "data-testid": "hide-done" }), "Hide them in lists and the timeline"] })] })] }), _jsxs("section", { className: styles.section, children: [_jsx("h2", { className: styles.heading, children: "Pages" }), _jsx("p", { className: styles.description, children: "Deleting a page always asks what happens to its tasks \u2014 they are never silently destroyed." }), _jsx("ul", { className: styles.pageList, children: pages.map((page) => (_jsxs("li", { className: styles.pageItem, children: [_jsx("span", { className: styles.pageDot, style: { background: page.colour } }), _jsx("span", { className: styles.pageName, children: page.name }), pages.length > 1 &&
                                    (pendingPage === page.id ? (_jsxs("span", { className: styles.pagePolicy, children: [_jsx("span", { className: styles.policyLabel, children: "Its tasks:" }), _jsxs("select", { className: styles.policySelect, defaultValue: "", onChange: (event) => {
                                                    const value = event.target.value;
                                                    if (!value)
                                                        return;
                                                    if (value === 'delete')
                                                        onDeletePage(page.id, { tasks: 'delete' });
                                                    else
                                                        onDeletePage(page.id, { tasks: 'move', to: value });
                                                    setPendingPage(null);
                                                }, "data-testid": `delete-policy-${page.name}`, children: [_jsx("option", { value: "", children: "Choose\u2026" }), pages
                                                        .filter((p) => p.id !== page.id)
                                                        .map((p) => (_jsxs("option", { value: p.id, children: ["Move to ", p.name] }, p.id))), _jsx("option", { value: "delete", children: "Delete them too" })] }), _jsx("button", { type: "button", className: styles.textButton, onClick: () => setPendingPage(null), children: "Cancel" })] })) : (_jsx("button", { type: "button", className: styles.dangerButton, onClick: () => setPendingPage(page.id), "data-testid": `delete-page-${page.name}`, children: "Delete" })))] }, page.id))) })] }), _jsxs("section", { className: styles.section, children: [_jsx("h2", { className: styles.heading, children: "Your data" }), _jsx("p", { className: styles.description, children: "Everything exports as one readable JSON file \u2014 a backup that does not depend on the server, and a way out if you ever move off this app." }), _jsxs("div", { className: styles.dataRow, children: [_jsx("a", { className: styles.button, href: api.exportUrl(), download: true, "data-testid": "export-button", children: "Export everything" }), _jsx("a", { className: styles.textButton, href: api.exportUrl(true), download: true, children: "Include deleted" })] }), _jsxs("div", { className: styles.dataRow, children: [_jsxs("select", { className: styles.policySelect, value: importMode, onChange: (event) => setImportMode(event.target.value), "aria-label": "Import mode", "data-testid": "import-mode", children: [_jsx("option", { value: "merge", children: "Merge \u2014 add what is missing" }), _jsx("option", { value: "duplicate", children: "Duplicate \u2014 copy in under new ids" }), _jsx("option", { value: "replace", children: "Replace \u2014 wipe and restore" })] }), _jsx("button", { type: "button", className: styles.button, onClick: () => fileRef.current?.click(), "data-testid": "import-button", children: "Import a file" }), _jsx("input", { ref: fileRef, type: "file", accept: "application/json,.json", className: styles.fileInput, onChange: (event) => {
                                    const file = event.target.files?.[0];
                                    if (file)
                                        void handleFile(file);
                                }, "data-testid": "import-file" })] }), importMode === 'replace' && (_jsxs("p", { className: styles.warning, children: ["Replace deletes everything first. A backup of the current data is written to", _jsx("code", { children: " data/backups/" }), " before anything changes."] }))] })] }));
}
/** A miniature of the theme's character — rows and a timeline fragment — so the
 *  choice is made by looking rather than by reading. */
function ThemePreview({ variant }) {
    const config = {
        calm: { gap: 5, height: 6, radius: 3, line: 2.5, dot: 3 },
        bold: { gap: 6, height: 9, radius: 5, line: 4, dot: 4.5 },
        dense: { gap: 2.5, height: 3.5, radius: 1.5, line: 1.5, dot: 2 },
    }[variant];
    return (_jsx("svg", { viewBox: "0 0 108 52", className: styles.preview, "aria-hidden": "true", children: [0, 1, 2].map((i) => {
            const y = 8 + i * (config.height + config.gap);
            return (_jsxs("g", { children: [_jsx("rect", { x: "6", y: y, width: "26", height: config.height, rx: config.radius, className: styles.previewBar }), _jsx("line", { x1: "38", y1: y + config.height / 2, x2: 72 + i * 10, y2: y + config.height / 2, strokeWidth: config.line, strokeLinecap: "round", className: styles.previewLine, "data-index": i }), _jsx("circle", { cx: 52 + i * 6, cy: y + config.height / 2, r: config.dot, className: styles.previewDot, "data-index": i })] }, i));
        }) }));
}
//# sourceMappingURL=Settings.js.map
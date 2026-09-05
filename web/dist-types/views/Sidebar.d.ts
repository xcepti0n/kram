import type { Page } from '@tasktracker/shared';
export type ViewKey = {
    kind: 'overview';
} | {
    kind: 'timeline';
} | {
    kind: 'page';
    id: string;
} | {
    kind: 'settings';
};
interface Props {
    pages: Page[];
    view: ViewKey;
    onNavigate: (view: ViewKey) => void;
    onCreatePage: (name: string) => void;
    onRenamePage: (id: string, name: string) => void;
    onReorderPage: (id: string, before_id: string | null, after_id: string | null) => void;
    open: boolean;
    onClose: () => void;
}
export declare function Sidebar({ pages, view, onNavigate, onCreatePage, onRenamePage, onReorderPage, open, onClose, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Sidebar.d.ts.map
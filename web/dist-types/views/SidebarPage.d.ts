import type { Page } from '@tasktracker/shared';
interface Props {
    page: Page;
    active: boolean;
    onNavigate: () => void;
    onStartRename: () => void;
}
/** A draggable page in the sidebar. Pages carry a `position` exactly as tasks
 *  do, so the same neighbour-id reorder applies (FR-6.2). */
export declare function SidebarPage({ page, active, onNavigate, onStartRename }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=SidebarPage.d.ts.map
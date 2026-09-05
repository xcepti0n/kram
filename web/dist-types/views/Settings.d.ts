import type { ImportMode, Page, Settings as SettingsType } from '@tasktracker/shared';
interface Props {
    settings: SettingsType;
    pages: Page[];
    onChange: (input: Partial<Omit<SettingsType, 'user_id'>>) => void;
    onImport: (doc: unknown, mode: ImportMode) => void;
    onDeletePage: (id: string, policy: {
        tasks: 'move';
        to: string;
    } | {
        tasks: 'delete';
    }) => void;
}
export declare function Settings({ settings, pages, onChange, onImport, onDeletePage }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Settings.d.ts.map
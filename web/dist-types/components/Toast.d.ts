/**
 * Toasts, and the undo affordance that replaces confirmation dialogs (DD-7).
 *
 * A destructive action fires immediately and offers Undo here. Confirmation
 * dialogs tax every action to guard against a rare mistake; undo taxes none and
 * still recovers.
 */
import { type ReactNode } from 'react';
export type ToastKind = 'info' | 'success' | 'error';
export interface ToastAction {
    label: string;
    onAction: () => void | Promise<void>;
}
interface ToastApi {
    show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
}
export declare function useToast(): ToastApi;
export declare function ToastProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=Toast.d.ts.map
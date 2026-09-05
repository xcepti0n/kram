interface Props {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    /** Render as inline text that becomes an input on click, rather than a field. */
    inline?: boolean;
    autoFocus?: boolean;
    className?: string;
    'data-testid'?: string;
}
export declare function DateInput({ value, onChange, label, inline, autoFocus, className, 'data-testid': testId, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=DateInput.d.ts.map
export interface LocalizedOption {
    value: string;
    label: string;
}
/** Keep canonical filter values while ordering options by their visible labels. */
export declare function buildLocalizedOptions(values: string[], translate: (value: string) => string, locale: string): LocalizedOption[];

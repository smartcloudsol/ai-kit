import { type CatalogPage } from "@smart-cloud/ai-kit-core";
export interface CatalogPageLabels {
    catalogPreviousLabel: string;
    catalogNextLabel: string;
    catalogResultsLabel: string;
    catalogOfLabel: string;
    catalogMoreAvailableLabel: string;
    catalogExpiredLabel: string;
}
export declare function catalogPageNavigation(input: unknown, direction: "next" | "previous", busy: boolean, now?: number): string | undefined;
export declare function CatalogPageControls({ page: input, labels: sourceLabels, busy, onNavigate }: {
    page: CatalogPage;
    labels: CatalogPageLabels;
    busy?: boolean;
    onNavigate: (handle: string, label: string) => void;
}): import("react").JSX.Element | null;

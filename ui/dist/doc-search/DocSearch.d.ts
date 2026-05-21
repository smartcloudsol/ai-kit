import { type ContextKind } from "@smart-cloud/ai-kit-core";
import { FC } from "react";
export declare const DocSearch: FC<import("@smart-cloud/ai-kit-core").AiWorkerProps & {
    context?: ContextKind;
    autoRun?: boolean;
    title?: string;
    getSearchText?: () => string;
    searchButtonIcon?: string;
    showSearchButtonTitle?: boolean;
    showSearchButtonIcon?: boolean;
    showSources?: boolean;
    topK?: number;
    snippetMaxChars?: number;
    onClickDoc?: (doc: import("@smart-cloud/ai-kit-core").RetrievedDoc) => void;
    enableUserFilters?: boolean;
    availableCategories?: Record<string, string[]>;
    availableTags?: string[];
} & Partial<import("@smart-cloud/ai-kit-core").AiWorkerProps>>;

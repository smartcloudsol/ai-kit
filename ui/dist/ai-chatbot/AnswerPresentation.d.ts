import type { AnswerPresentation } from "@smart-cloud/ai-kit-core";
export interface AnswerCarouselLabels {
    previous: string;
    next: string;
    position: string;
    region: string;
}
export declare const AnswerCarouselLabelsContext: import("react").Context<AnswerCarouselLabels>;
/** The same source-independent layouts render approved REST, MCP and CPT data. */
export declare function AnswerPresentationView({ presentation, locale, carouselLabels }: {
    presentation?: AnswerPresentation;
    locale?: string;
    carouselLabels?: Partial<AnswerCarouselLabels>;
}): import("react").JSX.Element | null;

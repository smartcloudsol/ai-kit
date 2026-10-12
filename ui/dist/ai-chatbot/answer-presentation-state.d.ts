import { type AnswerEntity, type AnswerPresentation } from "@smart-cloud/ai-kit-core";
/** Browser storage and transport values are untrusted, including old history. */
export declare function normalizeAnswerPresentation(value: unknown): AnswerPresentation | undefined;
export declare function answerAttributeText(attribute: AnswerEntity["attributes"][number], locale?: string): string | undefined;
/** Join source-backed attribute IDs only; conflicting row contracts are never guessed. */
export declare function answerComparisonRows(entities: AnswerEntity[]): AnswerEntity["attributes"];
/** Retain only a validated envelope when crossing a history boundary. */
export declare function withSafeAnswerPresentation<T extends {
    presentation?: unknown;
}>(value: T): Omit<T, "presentation"> & {
    presentation?: AnswerPresentation;
};

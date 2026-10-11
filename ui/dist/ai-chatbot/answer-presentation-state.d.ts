import { type AnswerEntity, type AnswerPresentation } from "@smart-cloud/ai-kit-core";
/** Browser storage and transport values are untrusted, including old history. */
export declare function normalizeAnswerPresentation(value: unknown): AnswerPresentation | undefined;
export declare function answerAttributeText(attribute: AnswerEntity["attributes"][number]): string;
/** Retain only a validated envelope when crossing a history boundary. */
export declare function withSafeAnswerPresentation<T extends {
    presentation?: unknown;
}>(value: T): Omit<T, "presentation"> & {
    presentation?: AnswerPresentation;
};

import { parseAnswerPresentation, type AnswerEntity, type AnswerPresentation } from "@smart-cloud/ai-kit-core";

/** Browser storage and transport values are untrusted, including old history. */
export function normalizeAnswerPresentation(value: unknown): AnswerPresentation | undefined {
  return parseAnswerPresentation(value);
}

export function answerAttributeText(attribute: AnswerEntity["attributes"][number]): string {
  return Array.isArray(attribute.value) ? attribute.value.join(", ") : String(attribute.value);
}

/** Retain only a validated envelope when crossing a history boundary. */
export function withSafeAnswerPresentation<T extends { presentation?: unknown }>(value: T): Omit<T, "presentation"> & { presentation?: AnswerPresentation } {
  const { presentation, ...rest } = value;
  const parsed = normalizeAnswerPresentation(presentation);
  return { ...rest, ...(parsed ? { presentation: parsed } : {}) };
}

import { formatAnswerMoney, parseAnswerPresentation, type AnswerEntity, type AnswerMoney, type AnswerPresentation, type AnswerStatus } from "@smart-cloud/ai-kit-core";

/** Browser storage and transport values are untrusted, including old history. */
export function normalizeAnswerPresentation(value: unknown): AnswerPresentation | undefined {
  return parseAnswerPresentation(value);
}

export function answerAttributeText(attribute: AnswerEntity["attributes"][number], locale?: string): string | undefined {
  if (attribute.type === "money") return formatAnswerMoney(attribute.value as AnswerMoney, locale);
  if (attribute.type === "status") return (attribute.value as AnswerStatus).label;
  return Array.isArray(attribute.value) ? attribute.value.join(", ") : String(attribute.value);
}

/** Join source-backed attribute IDs only; conflicting row contracts are never guessed. */
export function answerComparisonRows(entities: AnswerEntity[]): AnswerEntity["attributes"] {
  const rows = new Map<string, AnswerEntity["attributes"][number] | undefined>();
  for (const entity of entities) for (const attribute of entity.attributes) {
    if (!rows.has(attribute.id)) rows.set(attribute.id, attribute);
    else {
      const current = rows.get(attribute.id);
      if (current && (current.label !== attribute.label || current.type !== attribute.type)) rows.set(attribute.id, undefined);
    }
  }
  return [...rows.values()].filter((row): row is AnswerEntity["attributes"][number] => row !== undefined);
}

/** Retain only a validated envelope when crossing a history boundary. */
export function withSafeAnswerPresentation<T extends { presentation?: unknown }>(value: T): Omit<T, "presentation"> & { presentation?: AnswerPresentation } {
  const { presentation, ...rest } = value;
  const parsed = normalizeAnswerPresentation(presentation);
  return { ...rest, ...(parsed ? { presentation: parsed } : {}) };
}

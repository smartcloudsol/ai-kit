import { parseDocument, stringify } from "yaml";

import type { ExternalVocabularySource } from "./backend-client";

export function serializeMetadataLayer(value: unknown): string {
  return stringify(value, { lineWidth: 0, aliasDuplicateObjects: false });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Keep unknown producer fields intact. Validation only checks the shared API shape.
export function parseExternalVocabularyYaml(
  raw: string,
  __: (text: string) => string = (text) => text,
): ExternalVocabularySource[] {
  const document = parseDocument(raw, { uniqueKeys: true, schema: "core" });
  const issue = document.errors[0] ?? document.warnings[0];
  if (issue) throw new Error(issue.message);
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!Array.isArray(value)) {
    throw new Error(
      __("External vocabulary sources must be a YAML sequence (array)."),
    );
  }
  const ids = new Set<string>();
  for (const [index, source] of value.entries()) {
    if (
      !isRecord(source) ||
      typeof source.id !== "string" ||
      !source.id.trim() ||
      typeof source.enabled !== "boolean" ||
      !isRecord(source.namespaces)
    ) {
      throw new Error(
        `${index + 1}: ${__(
          "Each external vocabulary source needs a non-empty id, boolean enabled, and namespaces mapping.",
        )}`,
      );
    }
    if (ids.has(source.id))
      throw new Error(
        `${__("Duplicate external vocabulary source id:")} ${source.id}`,
      );
    ids.add(source.id);
    for (const terms of Object.values(source.namespaces)) {
      if (
        !Array.isArray(terms) ||
        terms.some(
          (term) =>
            typeof term !== "string" &&
            (!isRecord(term) ||
              typeof term.slug !== "string" ||
              typeof term.label !== "string" ||
              (term.parentSlug !== undefined &&
                typeof term.parentSlug !== "string")),
        )
      ) {
        throw new Error(
          `${source.id}: ${__(
            "Namespaces require sequences of strings or terms with slug, label, and optional parentSlug.",
          )}`,
        );
      }
    }
  }
  assertJsonCompatible(value, __);
  return value as ExternalVocabularySource[];
}

function assertJsonCompatible(
  value: unknown,
  __: (text: string) => string,
): void {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)))
  ) {
    throw new Error(
      __(
        "Metadata numbers must be finite and within the safe JSON integer range.",
      ),
    );
  }
  if (Array.isArray(value))
    value.forEach((item) => assertJsonCompatible(item, __));
  else if (isRecord(value))
    Object.values(value).forEach((item) => assertJsonCompatible(item, __));
}

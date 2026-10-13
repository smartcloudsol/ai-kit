import type { ProcessedCitations } from "@smart-cloud/ai-kit-core";
import { citationDisplayText, citationLinkUrl } from "../shared/citation-display.ts";

export type CitationLike = {
  url?: string;
  sourceUrl?: string;
  title?: string;
  description?: string;
  snippet?: string;
  sourceKind?: "knowledge_base" | "structured_content";
};

type CitationPayload = ProcessedCitations | CitationLike[] | undefined;

/** Compatibility with pre-sourceKind responses, including their truncated previews. */
function isLegacyStructuredPreview(value: string): boolean {
  if (/^\s*\{\s*"provenance"\s*:\s*"approved_own_structured_content"\s*(?:[,}]|$)/.test(value)) return true;
  if (!value.trimStart().startsWith("{")) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      Object.prototype.hasOwnProperty.call(parsed, "provenance") &&
      (parsed as { provenance?: unknown }).provenance === "approved_own_structured_content";
  } catch { return false; }
}

function cleanCitationPreview(value: string | undefined): string | undefined {
  if (!value?.trim() || isLegacyStructuredPreview(value)) return undefined;
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(?:\/?)(?:smartcloud|ai-kit)[^\]]*\]/gi, " ")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+\.|>)\s+/gm, " ")
    .replace(/(\*\*|__|~~|`)(.*?)\1/g, "$2");
  const normalized = citationDisplayText(text)?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return undefined;
  const characters = Array.from(normalized);
  return characters.length > 280
    ? `${characters.slice(0, 279).join("").trimEnd()}…`
    : normalized;
}

type DisplayCitation = { citation: CitationLike; previewPriority: number };

/** Merge only visible links; retrieval IDs, chunks, anchors and evidence stay intact. */
function mergeDisplayCitations(entries: DisplayCitation[]): CitationLike[] | undefined {
  const merged: DisplayCitation[] = [];
  const byUrl = new Map<string, DisplayCitation>();
  for (const entry of entries) {
    const link = citationLinkUrl(entry.citation.sourceUrl) ?? citationLinkUrl(entry.citation.url);
    const key = link ? new URL(link).href : undefined;
    const previous = key ? byUrl.get(key) : undefined;
    if (!previous) {
      merged.push(entry);
      if (key) byUrl.set(key, entry);
      continue;
    }
    if (!previous.citation.title && entry.citation.title) previous.citation.title = entry.citation.title;
    if (entry.previewPriority > previous.previewPriority) {
      previous.citation.snippet = entry.citation.snippet;
      previous.previewPriority = entry.previewPriority;
    }
  }
  return merged.length ? merged.map(entry => entry.citation) : undefined;
}

/**
 * Normalize both the current structured citation response and the legacy flat
 * response used by older backends during rolling upgrades.
 */
export function normalizeChatCitations(
  citations: CitationPayload,
): CitationLike[] | undefined {
  if (!citations) return undefined;
  if (Array.isArray(citations)) {
    return mergeDisplayCitations(citations.map((citation) => {
      const structured = citation.sourceKind === "structured_content";
      const description = structured ? undefined : cleanCitationPreview(citation.description);
      const preview = description ?? (structured ? undefined : cleanCitationPreview(citation.snippet));
      const rest = { ...citation };
      delete rest.snippet;
      if (structured || (citation.description && isLegacyStructuredPreview(citation.description))) delete rest.description;
      return { citation: preview ? { ...rest, snippet: preview } : rest, previewPriority: description ? 2 : preview ? 1 : 0 };
    }));
  }

  const firstSnippetByDocument = new Map<string, string>();
  for (const chunk of citations.chunks ?? []) {
    const preview = cleanCitationPreview(chunk.snippet);
    if (preview && !firstSnippetByDocument.has(chunk.docId)) {
      firstSnippetByDocument.set(chunk.docId, preview);
    }
  }

  const normalized = (citations.docs ?? []).map((document): DisplayCitation => {
    // The optional discriminator is absent on older Core/backend versions.
    const structured = (document as { sourceKind?: string }).sourceKind === "structured_content";
    const description = structured ? undefined : cleanCitationPreview(document.description);
    const preview = description ?? (structured ? undefined : firstSnippetByDocument.get(document.docId));
    return { citation: {
      ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
      ...(document.title ? { title: document.title } : {}),
      ...(preview ? { snippet: preview } : {}),
    }, previewPriority: description ? 2 : preview ? 1 : 0 };
  });

  return mergeDisplayCitations(normalized);
}

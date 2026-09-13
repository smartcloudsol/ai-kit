import type { ProcessedCitations } from "@smart-cloud/ai-kit-core";

export type CitationLike = {
  url?: string;
  sourceUrl?: string;
  title?: string;
  snippet?: string;
};

type CitationPayload = ProcessedCitations | CitationLike[] | undefined;

/**
 * Normalize both the current structured citation response and the legacy flat
 * response used by older backends during rolling upgrades.
 */
export function normalizeChatCitations(
  citations: CitationPayload,
): CitationLike[] | undefined {
  if (!citations) return undefined;
  if (Array.isArray(citations)) return citations.length ? citations : undefined;

  const firstSnippetByDocument = new Map<string, string>();
  for (const chunk of citations.chunks ?? []) {
    if (chunk.snippet && !firstSnippetByDocument.has(chunk.docId)) {
      firstSnippetByDocument.set(chunk.docId, chunk.snippet);
    }
  }

  const normalized = (citations.docs ?? []).map((document) => ({
    ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
    ...(document.title ? { title: document.title } : {}),
    ...(firstSnippetByDocument.get(document.docId)
      ? { snippet: firstSnippetByDocument.get(document.docId) }
      : {}),
  }));

  return normalized.length ? normalized : undefined;
}

import type { ProcessedCitations } from "@smart-cloud/ai-kit-core";

export type CitationLike = {
  url?: string;
  sourceUrl?: string;
  title?: string;
  description?: string;
  snippet?: string;
};

type CitationPayload = ProcessedCitations | CitationLike[] | undefined;

function cleanCitationPreview(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const entities: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    hellip: "…", mdash: "-", ndash: "-",
  };
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(?:\/?)(?:smartcloud|ai-kit)[^\]]*\]/gi, " ")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+\.|>)\s+/gm, " ")
    .replace(/(\*\*|__|~~|`)(.*?)\1/g, "$2")
    .replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const codePoint = entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  const characters = Array.from(text);
  return characters.length > 280
    ? `${characters.slice(0, 279).join("").trimEnd()}…`
    : text;
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
    return citations.length
      ? citations.map((citation) => {
          const preview = cleanCitationPreview(citation.description) ??
            cleanCitationPreview(citation.snippet);
          if (!preview && !citation.snippet) return citation;
          const rest = { ...citation };
          delete rest.snippet;
          return preview ? { ...rest, snippet: preview } : rest;
        })
      : undefined;
  }

  const firstSnippetByDocument = new Map<string, string>();
  for (const chunk of citations.chunks ?? []) {
    const preview = cleanCitationPreview(chunk.snippet);
    if (preview && !firstSnippetByDocument.has(chunk.docId)) {
      firstSnippetByDocument.set(chunk.docId, preview);
    }
  }

  const normalized = (citations.docs ?? []).map((document) => {
    const preview = cleanCitationPreview(document.description) ??
      firstSnippetByDocument.get(document.docId);
    return {
      ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
      ...(document.title ? { title: document.title } : {}),
      ...(preview ? { snippet: preview } : {}),
    };
  });

  return normalized.length ? normalized : undefined;
}

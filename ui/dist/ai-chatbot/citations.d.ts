import type { ProcessedCitations } from "@smart-cloud/ai-kit-core";
export type CitationLike = {
    url?: string;
    sourceUrl?: string;
    title?: string;
    description?: string;
    snippet?: string;
};
type CitationPayload = ProcessedCitations | CitationLike[] | undefined;
/**
 * Normalize both the current structured citation response and the legacy flat
 * response used by older backends during rolling upgrades.
 */
export declare function normalizeChatCitations(citations: CitationPayload): CitationLike[] | undefined;
export {};

/**
 * Text chunking utilities for handling large inputs in AI features
 *
 * Chunking is needed for:
 * - On-device models with token quotas (~8000 tokens)
 * - AWS Translate backend (10,000 character limit)
 */

export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

/**
 * Estimate token count from text
 * Approximation: 1 token ≈ 3.5 characters for Hungarian text
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Check if input should be chunked based on mode and size
 */
export function shouldChunkInput(
  text: string,
  mode: "summarize" | "translate" | "rewrite" | "proofread",
  isOnDevice: boolean,
): boolean {
  const tokens = estimateTokenCount(text);

  if (isOnDevice) {
    // On-device models have token quotas
    const quotas = {
      summarize: 8000,
      translate: 8000,
      rewrite: 8000,
      proofread: 10000, // Proofreader has higher quota
    };

    const quota = quotas[mode] || 8000;
    // Use 80% threshold for safety (buffer for output)
    return tokens > quota * 0.8;
  }

  // Backend: only AWS Translate has character limit
  if (mode === "translate") {
    // AWS Translate limit is 10,000 characters
    // Use 90% threshold (9,000 chars) for safety
    return text.length > 9000;
  }

  // Other backends can handle large inputs
  return false;
}

/**
 * Find the last sentence boundary before the given position
 */
function findLastSentenceBoundary(
  text: string,
  start: number,
  end: number,
): number {
  // Look for sentence enders: . ! ? followed by space or newline
  let lastBoundary = -1;

  for (let i = end - 1; i >= start; i--) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : "";

    if (
      (char === "." || char === "!" || char === "?") &&
      (nextChar === " " ||
        nextChar === "\n" ||
        nextChar === "\r" ||
        i === text.length - 1)
    ) {
      lastBoundary = i + 1;
      break;
    }
  }

  // Only accept if we found a boundary in the latter half of the chunk
  return lastBoundary > start + (end - start) * 0.5 ? lastBoundary : -1;
}

/**
 * Find the last clause boundary (comma, semicolon, colon)
 */
function findLastClauseBoundary(
  text: string,
  start: number,
  end: number,
): number {
  let lastBoundary = -1;

  for (let i = end - 1; i >= start; i--) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : "";

    if (
      (char === "," || char === ";" || char === ":") &&
      (nextChar === " " || nextChar === "\n" || nextChar === "\r")
    ) {
      lastBoundary = i + 1;
      break;
    }
  }

  return lastBoundary > start + (end - start) * 0.5 ? lastBoundary : -1;
}

/**
 * Split text into chunks at intelligent boundaries
 *
 * Priority order for splitting:
 * 1. Paragraph breaks (\n\n)
 * 2. Sentence endings (. ! ?)
 * 3. Clause markers (, ; :)
 * 4. Word boundaries (space)
 */
export function splitTextIntoChunks(
  text: string,
  maxCharsPerChunk: number,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    let chunkEnd = Math.min(currentPos + maxCharsPerChunk, text.length);

    if (chunkEnd < text.length) {
      // Try to split at paragraph break
      const paragraphBreakPos = text.lastIndexOf("\n\n", chunkEnd);
      if (paragraphBreakPos > currentPos + maxCharsPerChunk * 0.5) {
        chunkEnd = paragraphBreakPos + 2;
      } else {
        // Try to split at sentence boundary
        const sentenceEnd = findLastSentenceBoundary(
          text,
          currentPos,
          chunkEnd,
        );
        if (sentenceEnd > 0) {
          chunkEnd = sentenceEnd;
        } else {
          // Try to split at clause boundary
          const clauseEnd = findLastClauseBoundary(text, currentPos, chunkEnd);
          if (clauseEnd > 0) {
            chunkEnd = clauseEnd;
          } else {
            // Last resort: split at word boundary
            const wordEnd = text.lastIndexOf(" ", chunkEnd);
            if (wordEnd > currentPos + maxCharsPerChunk * 0.5) {
              chunkEnd = wordEnd + 1;
            }
            // If no good boundary found, just cut at maxCharsPerChunk
          }
        }
      }
    }

    const chunkText = text.substring(currentPos, chunkEnd).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        start: currentPos,
        end: chunkEnd,
      });
    }

    currentPos = chunkEnd;
  }

  return chunks;
}

/**
 * Calculate appropriate chunk size based on mode and whether it's on-device
 */
export function getChunkSize(
  mode: "summarize" | "translate" | "rewrite" | "proofread",
  isOnDevice: boolean,
): number {
  if (isOnDevice) {
    // On-device: use token-based chunking
    // Convert tokens to characters (80% of quota for safety)
    const quotas = {
      summarize: 8000,
      translate: 8000,
      rewrite: 8000,
      proofread: 10000,
    };

    const quota = quotas[mode] || 8000;
    const safeQuota = quota * 0.8;
    // Convert tokens to chars (1 token ≈ 3.5 chars)
    return Math.floor(safeQuota * 3.5);
  }

  // Backend: only for AWS Translate
  if (mode === "translate") {
    // AWS Translate: 10,000 char limit, use 9,000 for safety
    return 9000;
  }

  // Should not reach here if shouldChunkInput is used correctly
  return 10000;
}

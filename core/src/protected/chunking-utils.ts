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

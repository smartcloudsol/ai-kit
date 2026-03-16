/**
 * Chunked versions of AI features for handling large inputs
 *
 * These wrappers split large inputs into smaller chunks, process them
 * sequentially, and combine the results.
 */

import type {
  AiKitStatusEvent,
  FeatureOptions,
  SummarizeArgs,
  SummarizeResult,
  TranslateArgs,
  TranslateResult,
  RewriteArgs,
  RewriteResult,
} from "@smart-cloud/ai-kit-core";
import { summarize, translate, rewrite } from "@smart-cloud/ai-kit-core";
import {
  splitTextIntoChunks,
  getChunkSize,
  estimateTokenCount,
} from "./chunking-utils";

/**
 * Chunked summarize implementation
 *
 * Strategy:
 * 1. Split text into chunks
 * 2. Summarize each chunk
 * 3. If combined summaries are still large, recursively summarize them
 * 4. Return final summary
 */
export async function chunkedSummarize(
  text: string,
  args: SummarizeArgs,
  options: FeatureOptions,
  isOnDevice: boolean,
  recursionLevel: number = 0,
): Promise<SummarizeResult> {
  const maxChunkSize = getChunkSize("summarize", isOnDevice);
  const chunks = splitTextIntoChunks(text, maxChunkSize);

  if (chunks.length === 1) {
    // No chunking needed
    return await summarize(args, options);
  }

  // Prevent infinite recursion (max 2 levels)
  if (recursionLevel >= 2) {
    throw new Error(
      "Text is too large to summarize. Please try using backend mode or reduce the input size.",
    );
  }

  // Phase 1: Summarize each chunk
  const chunkSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkResult = await summarize(
      {
        ...args,
        text: chunks[i].text,
      },
      {
        ...options,
        onStatus: (e: AiKitStatusEvent) => {
          if (options.onStatus) {
            // Modify progress to reflect chunking
            const baseProgress =
              typeof e.progress === "number" ? e.progress : 0;
            const chunkProgress = (i + baseProgress) / chunks.length;

            options.onStatus({
              ...e,
              message:
                recursionLevel === 0
                  ? `Summarizing part ${i + 1}/${chunks.length}...`
                  : `Combining summaries (${i + 1}/${chunks.length})...`,
              progress: chunkProgress,
            });
          }
        },
      },
    );

    chunkSummaries.push(chunkResult.result);
  }

  // Phase 2: Combine summaries
  const combinedSummaries = chunkSummaries.join("\n\n");

  // Check if we need another round of summarization
  if (estimateTokenCount(combinedSummaries) > maxChunkSize / 3.5) {
    // Recursively summarize
    return await chunkedSummarize(
      combinedSummaries,
      {
        ...args,
        // Adjust length for recursive summarization
        length: args.length === "short" ? "short" : "medium",
      },
      {
        ...options,
        onStatus: (e: AiKitStatusEvent) => {
          if (options.onStatus) {
            options.onStatus({
              ...e,
              message: "Creating final summary...",
            });
          }
        },
      },
      isOnDevice,
      recursionLevel + 1,
    );
  }

  // Final summarization
  return await summarize(
    {
      ...args,
      text: combinedSummaries,
      length: args.length === "short" ? "short" : "medium",
    },
    {
      ...options,
      onStatus: (e: AiKitStatusEvent) => {
        if (options.onStatus) {
          options.onStatus({
            ...e,
            message: "Creating final summary...",
          });
        }
      },
    },
  );
}

/**
 * Chunked translate implementation
 *
 * Strategy:
 * 1. Split text into chunks (respecting AWS Translate 10k char limit)
 * 2. Translate each chunk sequentially
 * 3. Join translated chunks
 */
export async function chunkedTranslate(
  text: string,
  args: TranslateArgs,
  options: FeatureOptions,
  isOnDevice: boolean,
): Promise<TranslateResult> {
  const maxChunkSize = getChunkSize("translate", isOnDevice);
  const chunks = splitTextIntoChunks(text, maxChunkSize);

  if (chunks.length === 1) {
    // No chunking needed
    return await translate(args, options);
  }

  // Translate each chunk sequentially
  const translatedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkResult = await translate(
      {
        ...args,
        text: chunks[i].text,
      },
      {
        ...options,
        onStatus: (e: AiKitStatusEvent) => {
          if (options.onStatus) {
            const baseProgress =
              typeof e.progress === "number" ? e.progress : 0;
            const chunkProgress = (i + baseProgress) / chunks.length;

            options.onStatus({
              ...e,
              message: `Translating part ${i + 1}/${chunks.length}...`,
              progress: chunkProgress,
            });
          }
        },
      },
    );

    translatedChunks.push(chunkResult.result);
  }

  // Join with paragraph breaks to maintain structure
  return {
    result: translatedChunks.join("\n\n"),
  };
}

/**
 * Chunked rewrite implementation
 *
 * Strategy:
 * 1. Split text into chunks
 * 2. Rewrite each chunk sequentially
 * 3. Join rewritten chunks
 */
export async function chunkedRewrite(
  text: string,
  args: RewriteArgs,
  options: FeatureOptions,
  isOnDevice: boolean,
): Promise<RewriteResult> {
  const maxChunkSize = getChunkSize("rewrite", isOnDevice);
  const chunks = splitTextIntoChunks(text, maxChunkSize);

  if (chunks.length === 1) {
    // No chunking needed
    return await rewrite(args, options);
  }

  // Rewrite each chunk sequentially
  const rewrittenChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkResult = await rewrite(
      {
        ...args,
        text: chunks[i].text,
      },
      {
        ...options,
        onStatus: (e: AiKitStatusEvent) => {
          if (options.onStatus) {
            const baseProgress =
              typeof e.progress === "number" ? e.progress : 0;
            const chunkProgress = (i + baseProgress) / chunks.length;

            options.onStatus({
              ...e,
              message: `Rewriting part ${i + 1}/${chunks.length}...`,
              progress: chunkProgress,
            });
          }
        },
      },
    );

    rewrittenChunks.push(chunkResult.result);
  }

  // Join with paragraph breaks
  return {
    result: rewrittenChunks.join("\n\n"),
  };
}

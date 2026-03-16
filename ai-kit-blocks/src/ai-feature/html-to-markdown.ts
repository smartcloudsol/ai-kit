/**
 * HTML to Markdown conversion utilities
 *
 * These dependencies (unified, rehype-*, remark-*) are external and loaded
 * via ai-kit-ui.js which is included on all pages by ai-kit-main.
 */

import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

/**
 * Convert HTML to Markdown
 *
 * This reduces the size of content sent to AI features while preserving
 * formatting and emphasis (bold, italic, lists, etc.)
 *
 * @param html - HTML string to convert
 * @returns Markdown string
 */
export const htmlToMarkdown = async (html: string): Promise<string> => {
  try {
    const result = await unified()
      .use(rehypeParse, {
        fragment: true, // Parse as HTML fragment, not full document
      })
      .use(rehypeRemark)
      .use(remarkGfm) // Support GitHub Flavored Markdown features
      .use(remarkStringify) // Use default markdown formatting
      .process(html);

    return String(result).trim();
  } catch (error) {
    console.warn(
      "AI Kit: Failed to convert HTML to Markdown, using original HTML:",
      error,
    );
    // Fallback to original HTML if conversion fails
    return html;
  }
};

/**
 * Synchronous version for simple HTML cleanup
 * Strips HTML tags and returns plain text as fallback
 */
export const stripHtmlTags = (html: string): string => {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
};

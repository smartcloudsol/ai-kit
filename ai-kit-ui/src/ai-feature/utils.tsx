import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export const markdownToHtml = async (markdown: string): Promise<string> => {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, {
        allowDangerousHtml: false,
      })
      .use(rehypeSanitize, defaultSchema)
      .use(rehypeStringify)
      .process(markdown),
  );
};

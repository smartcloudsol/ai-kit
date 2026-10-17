import { parseAnswerPresentation } from "@smart-cloud/ai-kit-core";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/** Render-only defense for legacy answers; text can never authorize a card. */
export function hideVerifiedPresentationDirectives(value: unknown, source: string) {
  const presentation = parseAnswerPresentation(value);
  return () => (tree: MarkdownNode) => {
    if (!presentation) return;
    const removable = (node: MarkdownNode): boolean => {
      if (node.type !== "paragraph" || node.children?.length !== 1 || node.children[0]?.type !== "text") return false;
      const text = node.children[0].value ?? "";
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      // Escaped Markdown is authored text, not an emitted protocol token.
      if (start === undefined || end === undefined || source.slice(start, end).trim() !== text.trim()) return false;
      const match = /^\[\[(?:presentation|present_entities|display_entities):([a-z0-9][a-z0-9._-]{0,127})\|([a-z0-9][a-z0-9,._-]{0,1023})\]\]$/i.exec(text.trim());
      if (!match) return false;
      const refs = match[2].split(",");
      if (new Set(refs).size !== refs.length) return false;
      return presentation.groups.some(group => group.templateId === match[1] && group.entities.length === refs.length &&
        group.entities.every(entity => refs.includes(entity.ref)));
    };
    const visit = (node: MarkdownNode) => {
      if (["blockquote", "code", "inlineCode", "link", "linkReference", "html"].includes(node.type) || !node.children) return;
      node.children = node.children.filter(child => !removable(child));
      node.children.forEach(visit);
    };
    visit(tree);
  };
}

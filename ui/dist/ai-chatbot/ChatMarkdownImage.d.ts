import { type ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";
export interface ChatMarkdownImageLabels {
    enlarge: string;
    close: string;
    preview: string;
    unavailable: string;
}
/** Authored block labels can override these without changing runtime language. */
export declare const ChatMarkdownImageLabelsContext: import("react").Context<ChatMarkdownImageLabels>;
/** ReactMarkdown has already sanitized src; do not introduce another URL or srcSet. */
export declare function ChatMarkdownImage({ src, alt, title, labels: suppliedLabels }: ComponentPropsWithoutRef<"img"> & ExtraProps & {
    labels?: Partial<ChatMarkdownImageLabels>;
}): import("react").JSX.Element;
/** A Markdown linked image must not produce an interactive button inside a link. */
export declare function ChatMarkdownLink({ children, node, ...props }: ComponentPropsWithoutRef<"a"> & ExtraProps): import("react").JSX.Element;

interface MarkdownNode {
    type: string;
    value?: string;
    children?: MarkdownNode[];
    position?: {
        start: {
            offset?: number;
        };
        end: {
            offset?: number;
        };
    };
}
/** Render-only defense for legacy answers; text can never authorize a card. */
export declare function hideVerifiedPresentationDirectives(value: unknown, source: string): () => (tree: MarkdownNode) => void;
export {};

/** Transport-free display contracts. Mapping never grants source access. */
export type AnswerLayout = "compact-list" | "cards" | "carousel";
export type AnswerAttributeType = "string" | "number" | "boolean" | "string-list";
export type AnswerSource = {
    kind: "structured_content";
    postTypes: string[];
} | {
    kind: "external_rest";
    toolId: string;
} | {
    kind: "external_mcp";
    serverId: string;
    toolName: string;
};
export interface AnswerTemplate {
    id: string;
    revision: number;
    layout: AnswerLayout;
    heading?: string;
    source: AnswerSource;
    itemsPointer: string;
    bindings: {
        id: string;
        title: string;
        description?: string;
    };
    image?: {
        pointer: string;
        altPointer?: string;
        allowedUrlPrefixes: string[];
    };
    attributes: {
        id: string;
        label: string;
        pointer: string;
        type: AnswerAttributeType;
    }[];
    links: {
        id: string;
        label: string;
        pointer: string;
        allowedUrlPrefixes: string[];
    }[];
    maxItems: number;
}
export interface AnswerPresentationPolicy {
    schemaVersion: 1;
    enabled: boolean;
    templates: AnswerTemplate[];
}
export interface AnswerEntity {
    ref: string;
    entityId: string;
    title: string;
    description?: string;
    image?: {
        url: string;
        alt: string;
    };
    attributes: {
        id: string;
        label: string;
        type: AnswerAttributeType;
        value: string | number | boolean | string[];
    }[];
    links: {
        id: string;
        label: string;
        url: string;
    }[];
    provenance: {
        kind: AnswerSource["kind"];
        sourceId: string;
        evidenceId: string;
        checkedAt: string;
    };
}
export interface AnswerPresentation {
    schemaVersion: 1;
    groups: {
        templateId: string;
        templateRevision: number;
        layout: AnswerLayout;
        heading?: string;
        entities: AnswerEntity[];
    }[];
}
export declare const ANSWER_PRESENTATION_MAX_BYTES = 12000;
export declare const ANSWER_PRESENTATION_MAX_GROUPS = 2;
/** Only own properties: no expressions, coercion, wildcards or prototype traversal. */
export declare function readAnswerPointer(value: unknown, path: string): unknown;
/** Public navigation/media only. This function does not fetch a URL. */
export declare function isAnswerHttpsUrl(value: unknown): value is string;
export declare function isAnswerUrlAllowed(value: unknown, allowed: string[]): value is string;
export declare function parseAnswerPresentationPolicy(value: unknown): AnswerPresentationPolicy;
/** Called on approved projected source values, never on model-authored facts. */
export declare function materializeAnswerEntity(template: AnswerTemplate, item: unknown, provenance: AnswerEntity["provenance"], ref: string): AnswerEntity | undefined;
/** Fail closed on malformed/future envelopes; callers preserve the text answer. */
export declare function parseAnswerPresentation(value: unknown): AnswerPresentation | undefined;

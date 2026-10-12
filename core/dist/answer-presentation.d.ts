/** Transport-free display contracts. Mapping never grants source access. */
export type AnswerLayout = "compact-list" | "cards" | "carousel" | "comparison";
export type AnswerPreset = "product-cards" | "comparison" | "recommendations" | "status-cards";
export type AnswerAttributeType = "string" | "number" | "boolean" | "string-list" | "money" | "status";
export type AnswerStatusSemantics = "orderability" | "inventory" | "booking" | "state";
export type AnswerStatusCode = "orderable" | "in-stock" | "backorder" | "available" | "unavailable" | "unknown" | "pending" | "complete" | "warning" | "error" | "info";
export interface AnswerMoney {
    amount: string;
    currency: string;
    unit: "major" | "minor";
    scale?: number;
}
export interface AnswerStatus {
    code: AnswerStatusCode;
    label: string;
    semantics: AnswerStatusSemantics;
}
export type AnswerAttributeValue = string | number | boolean | string[] | AnswerMoney | AnswerStatus;
export interface AnswerAttributeMapping {
    id: string;
    label: string;
    pointer: string;
    type: AnswerAttributeType;
    role?: "price" | "availability" | "status" | "detail";
    money?: {
        currencyPointer: string;
        unit: "major" | "minor";
        scale?: number;
        scalePointer?: string;
    };
    status?: {
        semantics: AnswerStatusSemantics;
        values: {
            value: string | number | boolean;
            code: AnswerStatusCode;
            label: string;
        }[];
        unknownLabel?: string;
    };
}
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
    preset?: AnswerPreset;
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
    attributes: AnswerAttributeMapping[];
    links: {
        id: string;
        label: string;
        pointer: string;
        allowedUrlPrefixes: string[];
        appearance?: "primary" | "secondary";
    }[];
    maxItems: number;
}
export interface AnswerPresentationPolicy {
    schemaVersion: 1 | 2;
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
        value: AnswerAttributeValue;
        role?: AnswerAttributeMapping["role"];
    }[];
    links: {
        id: string;
        label: string;
        url: string;
        appearance?: "primary" | "secondary";
    }[];
    provenance: {
        kind: AnswerSource["kind"];
        sourceId: string;
        evidenceId: string;
        checkedAt: string;
    };
}
export interface AnswerPresentation {
    schemaVersion: 1 | 2;
    locale?: string;
    groups: {
        templateId: string;
        templateRevision: number;
        layout: AnswerLayout;
        preset?: AnswerPreset;
        heading?: string;
        entities: AnswerEntity[];
    }[];
}
export declare const ANSWER_PRESENTATION_MAX_BYTES = 12000;
export declare const ANSWER_PRESENTATION_MAX_GROUPS = 2;
/** Preserve exact source units; only formatting is localized, never currency conversion. */
export declare function formatAnswerMoney(value: AnswerMoney, locale?: string): string | undefined;
/** Enumerate every input pointer, including secondary typed-value bindings. */
export declare function answerTemplatePointers(template: AnswerTemplate): string[];
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
/** Old clients receive only their negotiated schema; no new model invocation. */
export declare function answerPresentationForVersion(value: unknown, version: 1 | 2, locale?: string): AnswerPresentation | undefined;

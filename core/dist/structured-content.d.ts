/** Transport-free, opt-in own-field contracts. Identity and release data are not own fields. */
export declare const STRUCTURED_CONTENT_SCHEMA_VERSION: 1;
export declare const STRUCTURED_CONTENT_DOCUMENT_SCHEMA_VERSION: 2;
export declare const STRUCTURED_CONTENT_TEXT_FORMAT_SCHEMA_VERSION: 3;
export declare const STRUCTURED_CONTENT_LIMITS: {
    readonly fields: 32;
    readonly stringBytes: 4096;
    readonly listItems: 64;
    readonly payloadBytes: 8192;
    readonly descriptionBytes: 512;
    readonly documentBytes: 65536;
    readonly depth: 8;
    readonly schemaNodes: 128;
    readonly valueNodes: 2048;
};
export type StructuredContentScalarFieldType = "string" | "url" | "number" | "boolean" | "string-list";
export type StructuredContentFieldType = StructuredContentScalarFieldType | "object" | "array";
export type StructuredContentTextFormat = "plain-text" | "html" | "markdown";
export type StructuredContentValue = string | number | boolean | StructuredContentValue[] | {
    [key: string]: StructuredContentValue;
};
export type StructuredContentFieldSchema = {
    type: "string" | "string-list";
    description: string;
    contentFormat?: StructuredContentTextFormat;
} | {
    type: Exclude<StructuredContentScalarFieldType, "string" | "string-list">;
    description: string;
} | {
    type: "object";
    description: string;
    properties: Record<string, StructuredContentFieldSchema>;
} | {
    type: "array";
    description: string;
    items: StructuredContentFieldSchema;
};
export type StructuredContentPostField = "featuredImageUrl" | "featuredImageAlt" | "excerpt";
export type StructuredContentFieldSource = {
    sourceMetaKey: string;
    sourcePostField?: never;
} | {
    sourcePostField: StructuredContentPostField;
    sourceMetaKey?: never;
};
export type StructuredContentFieldMapping = StructuredContentFieldSchema & StructuredContentFieldSource & {
    targetKey: string;
};
export interface StructuredContentPolicy {
    enabled: boolean;
    fields: StructuredContentFieldMapping[];
}
export interface StructuredContentProjection {
    schemaVersion: 1 | 2 | 3;
    enabled: boolean;
    fields: Record<string, StructuredContentValue>;
    fieldSchema: Record<string, StructuredContentFieldSchema>;
}
export declare class StructuredContentContractError extends Error {
    readonly code: string;
    readonly field: string;
    constructor(code: string, field: string, message: string);
}
export declare function isStructuredContentTargetKey(key: string): boolean;
/** Schema-only helper for editors; never reads or authorizes source values. */
export declare function parseStructuredContentFieldSchema(value: unknown): StructuredContentFieldSchema;
export declare function parseStructuredContentPolicy(value: unknown): StructuredContentPolicy;
export declare function parseStructuredContentProjection(value: unknown): StructuredContentProjection;

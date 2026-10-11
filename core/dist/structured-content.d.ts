/** Transport-free, opt-in own-field contracts. Identity and release data are not own fields. */
export declare const STRUCTURED_CONTENT_SCHEMA_VERSION: 1;
export declare const STRUCTURED_CONTENT_LIMITS: {
    readonly fields: 32;
    readonly stringBytes: 4096;
    readonly listItems: 64;
    readonly payloadBytes: 8192;
    readonly descriptionBytes: 512;
};
export type StructuredContentFieldType = "string" | "url" | "number" | "boolean" | "string-list";
export type StructuredContentValue = string | number | boolean | string[];
export interface StructuredContentFieldSchema {
    type: StructuredContentFieldType;
    description: string;
}
export interface StructuredContentFieldMapping extends StructuredContentFieldSchema {
    sourceMetaKey: string;
    targetKey: string;
}
export interface StructuredContentPolicy {
    enabled: boolean;
    fields: StructuredContentFieldMapping[];
}
export interface StructuredContentProjection {
    schemaVersion: 1;
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
export declare function parseStructuredContentPolicy(value: unknown): StructuredContentPolicy;
export declare function parseStructuredContentProjection(value: unknown): StructuredContentProjection;

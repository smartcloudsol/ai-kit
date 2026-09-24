export declare const KNOWLEDGE_SYNC_CONTRACT_VERSION: 1;
export declare const KNOWLEDGE_SYNC_LOCALE_CONTRACT_VERSION: 2;
export type KnowledgeSyncOperation = "upsert" | "delete";
export type KnowledgeSyncReviewPolicy = "wordpress-publish-is-approval" | "manual-kb-review" | "disabled";
export interface KnowledgeSyncSourceIdentityV1 {
    producer: "wordpress";
    siteId: string;
    blogId: string;
    postType: string;
    postId: string;
}
export interface KnowledgeSyncMetadataTermV1 {
    namespace: string;
    slug: string;
    label: string;
}
export interface KnowledgeSyncDocumentV1 {
    profile: string;
    canonicalUrl: string;
    title: string;
    excerpt: string;
    content: string;
    contentType: "text/markdown";
    contentSha256: string;
    modifiedGmt: string;
    metadata: KnowledgeSyncMetadataTermV1[];
}
export interface KnowledgeSyncDocumentV2 extends KnowledgeSyncDocumentV1 {
    /** Canonical base-language BCP 47 tag used for single-language retrieval. */
    locale: string;
}
interface KnowledgeSyncProjectionBaseV1 {
    schemaVersion: typeof KNOWLEDGE_SYNC_CONTRACT_VERSION;
    source: KnowledgeSyncSourceIdentityV1;
    sourceVersion: string;
    correlationId: string;
    observedAt: string;
}
export type PublicContentProjectionV1 = KnowledgeSyncProjectionBaseV1 & ({
    operation: "upsert";
    document: KnowledgeSyncDocumentV1;
} | {
    operation: "delete";
    document: null;
    lastPublicUrl?: string;
});
interface KnowledgeSyncProjectionBaseV2 {
    schemaVersion: typeof KNOWLEDGE_SYNC_LOCALE_CONTRACT_VERSION;
    source: KnowledgeSyncSourceIdentityV1;
    sourceVersion: string;
    correlationId: string;
    observedAt: string;
}
export type PublicContentProjectionV2 = KnowledgeSyncProjectionBaseV2 & ({
    operation: "upsert";
    document: KnowledgeSyncDocumentV2;
} | {
    operation: "delete";
    document: null;
    lastPublicUrl?: string;
});
export type PublicContentProjection = PublicContentProjectionV1 | PublicContentProjectionV2;
export interface KnowledgeSyncPolicyV1 {
    schemaVersion: typeof KNOWLEDGE_SYNC_CONTRACT_VERSION;
    postType: string;
    enabled: boolean;
    autoEnableSource: "administrator" | "migration" | "system";
    reviewPolicy: KnowledgeSyncReviewPolicy;
    onPublish: "upsert";
    onPublishedUpdate: "upsert";
    onUnpublish: "delete";
    metadataRefresh: "reconcile";
    includeTaxonomies: string[];
    documentProfile: string;
}
export interface KnowledgeSyncBoundary {
    producer: KnowledgeSyncSourceIdentityV1["producer"];
    siteId: string;
}
export type SourceVersionOrder = "older" | "same" | "newer";
export declare class KnowledgeSyncContractError extends Error {
    readonly code: string;
    readonly field: string;
    constructor(code: string, field: string, message: string);
}
export declare function parsePublicContentProjectionV1(value: unknown, boundary?: KnowledgeSyncBoundary): PublicContentProjectionV1;
export declare function parsePublicContentProjectionV2(value: unknown, boundary?: KnowledgeSyncBoundary): PublicContentProjectionV2;
/** Parse either supported producer contract during the rolling upgrade. */
export declare function parsePublicContentProjection(value: unknown, boundary?: KnowledgeSyncBoundary): PublicContentProjection;
export declare function parseKnowledgeSyncPolicyV1(value: unknown): KnowledgeSyncPolicyV1;
export declare function compareKnowledgeSourceVersions(candidate: string, accepted: string): SourceVersionOrder;
export declare function knowledgeSyncSourceKey(source: KnowledgeSyncSourceIdentityV1): string;
export {};

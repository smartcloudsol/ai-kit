// KB Admin Backend API Client
// Handles all backend communication for KB Admin features

import {
  CapabilityDecision,
  dispatchBackend,
  resolveBackend,
} from "@smart-cloud/ai-kit-core";
import { wpRestCall } from "./api-client";

/**
 * KB Document structure for backend upload (matches backend types)
 */
export interface KBDocumentUpload {
  doc_id: string;
  title: string;
  sections: Array<{
    section_id: string;
    title: string;
    content: string;
    order_index: number;
    tags?: string[];
    extra_meta?: Record<string, unknown>;
  }>;
  metadata: {
    origin: string;
    revision: number;
    updatedAt: string;
    description?: string;
    postId?: number;
    postTitle?: string;
    postUrl?: string;
    siteId?: string;
    accountId?: string;
  };
}

export interface KBUploadRequest {
  postId: number;
  documents: KBDocumentUpload[];
  accountId: string;
  siteId: string;
}

export interface UploadedDocumentInfo {
  documentId: string;
  markdownKey: string;
  metadataKey: string;
}

export interface KBUploadResponse {
  success: boolean;
  message: string;
  postId: number;
  uploadedDocuments: UploadedDocumentInfo[];
  deletedOrphanDocuments: string[];
  syncJobId?: string;
}

const MAX_KB_CUSTOM_METADATA_SIZE = 1024;

function generateCompactMetadataContent(document: KBDocumentUpload): string {
  const allTags = new Set<string>();
  let category: string | undefined;
  let subcategory: string | undefined;
  let description: string | undefined;

  document.sections.forEach((section) => {
    section.tags?.forEach((tag) => allTags.add(tag));

    if (!category && typeof section.extra_meta?.category === "string") {
      category = section.extra_meta.category;
    }
    if (
      !subcategory &&
      typeof section.extra_meta?.subcategory === "string"
    ) {
      subcategory = section.extra_meta.subcategory;
    }
    if (
      !description &&
      typeof section.extra_meta?.description === "string"
    ) {
      description = section.extra_meta.description;
    }
  });

  return JSON.stringify({
    metadataAttributes: {
      doc_id: document.doc_id,
      title: document.title,
      ...(document.metadata.postUrl && {
        source_url: document.metadata.postUrl,
      }),
      ...(description && { description }),
      published_at: document.metadata.updatedAt.split("T")[0],
      origin: document.metadata.origin,
      ...(document.metadata.postId && {
        post_id: document.metadata.postId.toString(),
      }),
      revision: document.metadata.revision,
      ...(category && { category }),
      ...(subcategory && { subcategory }),
      ...(allTags.size > 0 && { tags: Array.from(allTags) }),
      ...(document.metadata.siteId && { site_id: document.metadata.siteId }),
      ...(document.metadata.accountId && {
        account_id: document.metadata.accountId,
      }),
    },
  });
}

function validateMetadataSizes(documents: KBDocumentUpload[]): void {
  const encoder = new TextEncoder();

  documents.forEach((document) => {
    const metadataSize = encoder.encode(
      generateCompactMetadataContent(document),
    ).byteLength;

    if (metadataSize > MAX_KB_CUSTOM_METADATA_SIZE) {
      throw new Error(
        `Knowledge Base metadata for "${document.title}" is ${metadataSize} bytes after JSON compression, exceeding the 1 KB (${MAX_KB_CUSTOM_METADATA_SIZE}-byte) S3 Vectors limit. Shorten the description, title, source URL, category or subcategory, or remove unnecessary taxonomy tags, then publish again. No files were uploaded.`,
      );
    }
  });
}

interface KBDeleteRequest {
  postId: number;
  documentId?: string; // Optional: delete specific document or all documents for the post
  accountId: string;
  siteId: string;
}

interface KBDeleteResponse {
  success: boolean;
  message: string;
  postId: number;
  deletedDocuments: string[];
  deletedCount: number;
}

async function getDecisionForAdminBackend(): Promise<CapabilityDecision> {
  const backend = await resolveBackend();

  return {
    feature: "prompt",
    source: "backend",
    mode: "backend-only",
    onDeviceAvailable: false,
    backendAvailable: backend.available,
    backendTransport: backend.transport,
    backendApiName: backend.apiName,
    backendBaseUrl: backend.baseUrl,
    reason: backend.reason ?? "",
  };
}

/**
 * Publish KB documents directly to backend (bypassing PHP REST API)
 * This uses batch upload with automatic orphan cleanup
 * This uses the authenticated Gatey/fetch transport configured in AI-Kit settings
 */
export async function publishKBDocumentsToBackend(
  postId: number,
  documents: KBDocumentUpload[],
  accountId: string,
  siteId: string,
): Promise<KBUploadResponse> {
  validateMetadataSizes(documents);

  const decision: CapabilityDecision = await getDecisionForAdminBackend();

  if (!decision.backendAvailable) {
    throw new Error("Backend not available");
  }

  const request: KBUploadRequest = {
    postId,
    documents,
    accountId,
    siteId,
  };

  return (await dispatchBackend(
    decision,
    "admin",
    "/kb/upload",
    "POST",
    request,
    {},
  )) as KBUploadResponse;
}

/**
 * Delete KB documents from backend (S3 and optionally Bedrock sync)
 * If documentId is provided, deletes only that document
 * If documentId is omitted, deletes all documents for the post
 * Should be called before disabling a KB source to clean up backend storage
 */
export async function deleteKBDocumentFromBackend(
  postId: number,
  accountId: string,
  siteId: string,
  documentId?: string,
): Promise<KBDeleteResponse> {
  const decision: CapabilityDecision = await getDecisionForAdminBackend();

  if (!decision.backendAvailable) {
    throw new Error("Backend not available");
  }

  const request: KBDeleteRequest = {
    postId,
    documentId,
    accountId,
    siteId,
  };

  return (await dispatchBackend(
    decision,
    "admin",
    "/kb/delete",
    "POST",
    request,
    {},
  )) as KBDeleteResponse;
}

/**
 * Sync publish state to WordPress database after successful backend upload
 * This ensures the WP database reflects the actual backend state
 */
export async function syncPublishStateToWordPress(
  postId: number,
  uploadedDocuments: UploadedDocumentInfo[],
): Promise<void> {
  await wpRestCall(`/kb/posts/${postId}/publish-state`, {
    method: "PUT",
    body: JSON.stringify({
      uploaded_documents: uploadedDocuments.map((doc) => ({
        doc_id: doc.documentId,
        s3_key: doc.markdownKey,
        uploaded_at: new Date().toISOString(),
      })),
    }),
  });
}

// ===============================================
// Metadata Config & Prompt Templates API
// ===============================================

export interface MetadataConfigCategory {
  category: string;
  subcategories?: string[];
}

export interface MetadataConfig {
  categories?: MetadataConfigCategory[];
  tags?: string[];
}

export interface MetadataConfigResponse {
  success: boolean;
  config: MetadataConfig;
  s3Key: string;
  lastModified?: string;
}

export interface MetadataConfigUpdateResponse {
  success: boolean;
  message: string;
  s3Key: string;
  updatedAt: string;
}

export interface PromptTemplate {
  type:
    | "query"
    | "summary"
    | "answer"
    | "answerKbOnly"
    | "answerAskWhenNoKb"
    | "answerKbPreferred"
    | "answerKbRag";
  content: string;
  s3Key: string;
  lastModified?: string;
}

export interface PromptTemplatesResponse {
  success: boolean;
  templates: PromptTemplate[];
}

export interface PromptTemplateUpdateResponse {
  success: boolean;
  message: string;
  type: string;
  s3Key: string;
  updatedAt: string;
}

/**
 * Get metadata config (categories/tags) from S3
 */
export async function getMetadataConfig(): Promise<MetadataConfigResponse> {
  const decision: CapabilityDecision = await getDecisionForAdminBackend();

  if (!decision.backendAvailable) {
    throw new Error("Backend not available");
  }

  return (await dispatchBackend(
    decision,
    "admin",
    "/kb/metadata-config",
    "GET",
    null,
    {},
  )) as MetadataConfigResponse;
}

/**
 * Update metadata config (categories/tags) in S3
 */
export async function updateMetadataConfig(
  config: MetadataConfig,
): Promise<MetadataConfigUpdateResponse> {
  const decision: CapabilityDecision = await getDecisionForAdminBackend();

  if (!decision.backendAvailable) {
    throw new Error("Backend not available");
  }
  return (await dispatchBackend(
    decision,
    "admin",
    "/kb/metadata-config",
    "PUT",
    { config },
    {},
  )) as MetadataConfigUpdateResponse;
}

/**
 * Get all prompt templates from S3
 */
export async function getPromptTemplates(): Promise<PromptTemplatesResponse> {
  const decision: CapabilityDecision = await getDecisionForAdminBackend();

  if (!decision.backendAvailable) {
    throw new Error("Backend not available");
  }

  return (await dispatchBackend(
    decision,
    "admin",
    "/kb/prompt-templates",
    "GET",
    null,
    {},
  )) as PromptTemplatesResponse;
}

/**
 * Update a specific prompt template in S3
 */
export async function updatePromptTemplate(
  type: PromptTemplate["type"],
  content: string,
): Promise<PromptTemplateUpdateResponse> {
  const decision: CapabilityDecision = await getDecisionForAdminBackend();

  if (!decision.backendAvailable) {
    throw new Error("Backend not available");
  }

  return (await dispatchBackend(
    decision,
    "admin",
    "/kb/prompt-templates",
    "PUT",
    { type, content },
    {},
  )) as PromptTemplateUpdateResponse;
}

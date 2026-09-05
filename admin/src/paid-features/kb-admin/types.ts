// KB Admin TypeScript Types
// Mirrors PHP backend data structures

export type KBPublishStatus =
  | "needs_review"
  | "ready_to_publish"
  | "published"
  | "sync_pending"
  | "sync_running"
  | "sync_delivered"
  | "sync_error"
  | "sync_blocked"
  | "sync_removed";

export interface KBSource {
  post_id: number;
  post_type: string;
  post_type_label: string;
  post_title: string;
  post_status: string;
  enabled: boolean;
  is_disabled_but_published: boolean;
  default_doc_mode: "base_only" | "inherit" | "separate_doc";
  updated_at: string;
  kb_publish_status: KBPublishStatus;
  kb_sync_error?: string | null;
}

export interface KBSection {
  section_id: string;
  mode: "inherit" | "separate_doc" | "exclude";
  sort_order: number;
  title: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  md: string;
  origin_hash: string;
  generated_at: string;
  extra_meta?: {
    description?: string;
    postUrl?: string;
    [key: string]: unknown;
  } | null;
  has_override: boolean;
  needs_review: boolean;
  override?: KBOverride;
}

export interface KBOverride {
  override_md: string;
  override_meta: {
    title?: string;
    description?: string;
    postUrl?: string;
    category?: string;
    subcategory?: string;
    tags?: string[];
  } | null;
  locked: boolean;
  origin_hash_at_override: string;
  updated_at: string;
}

export interface KBPublishState {
  effective_hash: string;
  last_published_at: string | null;
  last_backend_status: "success" | "pending" | "error" | null;
  last_backend_details: {
    length?: number;
    sections?: number;
    error?: string;
  } | null;
}

export interface KBDocument {
  doc_id: string;
  sections: KBSection[];
  publish_state: KBPublishState | null;
}

export interface KBPostData {
  post_id: number;
  post_title: string;
  post_excerpt?: string;
  post_type: string;
  post_status: string;
  post_url: string;
  source: {
    enabled: boolean;
    default_doc_mode: string;
    taxonomy_mapping: Record<string, string> | null;
  } | null;
  docs: KBDocument[];
}

export interface KBSourceEnableRequest {
  enabled: boolean;
  default_doc_mode?: string;
  taxonomy_mapping?: Record<string, string>;
}

export interface KBOverrideSaveRequest {
  doc_id: string;
  section_id: string;
  override_md: string;
  override_meta?: {
    title?: string;
    description?: string;
    postUrl?: string;
    category?: string;
    subcategory?: string;
    tags?: string[];
  };
  locked?: boolean;
}

export interface KBOverrideDeleteRequest {
  doc_id: string;
  section_id: string;
}

export interface KBPublishRequest {
  doc_id: string;
}

export interface KBPublishResponse {
  success: boolean;
  message: string;
  effective_hash?: string;
}

export interface KBApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

// Status for generating/publishing
export type KBDocumentStatus =
  | "clean" // Up-to-date with backend
  | "dirty" // Needs publishing
  | "needs-review" // Override exists but source changed
  | "generating" // Currently regenerating
  | "publishing"; // Currently publishing

// KB Settings
export interface KBSettings {
  base_url_override: string;
}

export interface KBSettingsUpdateRequest {
  base_url_override?: string;
}

export interface KBSettingsResponse {
  success: boolean;
  message?: string;
  settings: KBSettings;
}

// KB Sources pagination
export interface KBSourcesQuery {
  page?: number;
  per_page?: number;
  search?: string;
  status?: "all" | "publish" | "draft";
  type?: string;
  kb_status?: "all" | KBPublishStatus;
}

export interface KBSourcesResponse {
  items: KBSource[];
  post_type_options: Array<{
    value: string;
    label: string;
  }>;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export type KnowledgeSyncReviewPolicy =
  | "disabled"
  | "wordpress-publish-is-approval"
  | "manual-kb-review";

export interface KnowledgeSyncPolicy {
  schemaVersion: 1;
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

export interface KnowledgeSyncSettings {
  includeSubsites: boolean;
  baselinePageSize: number;
  transportBatchSize: number;
  backendBaseUrl: string;
  keyStorageMode: "disabled" | "file" | "encrypted-option";
  environment: "dev" | "staging" | "prod";
}

export interface KnowledgeSyncPostType {
  value: string;
  label: string;
  taxonomies: Array<{ value: string; label: string }>;
}

export interface KnowledgeSyncStatus {
  settings: KnowledgeSyncSettings;
  policies: Record<string, KnowledgeSyncPolicy>;
  baselines: Array<Record<string, string | number | null>>;
  outbox: Record<string, number>;
  blockedReasons: Record<string, number>;
  nextRunGmt: string | null;
  lastRun: {
    status: string;
    completedGmt?: string;
    blogs?: Array<Record<string, unknown>>;
  } | null;
  vocabulary: {
    sourceVersion: number;
    acceptedGmt?: string;
  } | null;
  availablePostTypes: KnowledgeSyncPostType[];
  multisite: {
    enabled: boolean;
    canIncludeSubsites: boolean;
  };
}

export interface KnowledgeSyncTransportStatus {
  configured: boolean;
  enrolled: boolean;
  keyId: string | null;
  workspaceId: string | null;
  siteId: string | null;
  environment: string;
  algorithm: string | null;
  keyStorageMode: string;
  backendCompatibility: {
    status: "unconfigured" | "legacy" | "verified";
    reason?: string;
    release?: string;
    apiSchemaVersion?: number | null;
    capabilities?: Record<string, number>;
  };
  remoteStatus?: {
    ingestion?: {
      status: string;
      requestedGeneration: number;
      activeGeneration: number;
      committedGeneration: number;
      retryCount: number;
      ingestionJobId: string | null;
      lastError: string | null;
      lastSuccessAt: number | null;
      lastCompletedJobId: string | null;
      lastDeletedDocumentCount: number;
      lastStatistics: Record<string, unknown> | null;
    } | null;
    manifest?: {
      status: string;
      counts?: Record<string, number>;
      nextPageToken?: string | null;
      sources?: Array<{
        sourceKey: string;
        sourceVersion: number;
        documentGeneration: number;
        status: string;
        expected: number;
        present: number;
      }>;
    } | null;
  } | null;
  remoteError?: string | null;
}

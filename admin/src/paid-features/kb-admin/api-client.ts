// KB Admin API Client
// WordPress REST API interactions for KB Admin

import { getAiKitPlugin } from "@smart-cloud/ai-kit-core";
import type {
  KBApiResponse,
  KBOverrideDeleteRequest,
  KBOverrideSaveRequest,
  KBPostData,
  KBPublishRequest,
  KBPublishResponse,
  KBSettings,
  KBSettingsResponse,
  KBSettingsUpdateRequest,
  KBSourceEnableRequest,
  KBSourcesQuery,
  KBSourcesResponse,
} from "./types";

/**
 * Get WordPress REST API base URL
 */
function getRestUrl(): string {
  const aikit = getAiKitPlugin();
  const wpRestUrl = aikit?.restUrl;
  if (!wpRestUrl) {
    throw new Error("WordPress REST API URL not found");
  }
  return wpRestUrl.replace(/\/+$/, "");
}

/**
 * Get nonce for REST API authentication
 */
function getNonce(): string {
  const aikit = getAiKitPlugin();
  const nonce = aikit?.nonce;
  if (!nonce) {
    throw new Error("WordPress REST API nonce not found");
  }
  return nonce;
}

/**
 * Call WordPress REST API
 */
export async function wpRestCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getRestUrl()}${endpoint}`;
  const nonce = getNonce();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-WP-Nonce": nonce,
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`REST API error (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Get all KB sources
 */
export async function fetchKBSources(
  query: KBSourcesQuery = {},
): Promise<KBSourcesResponse> {
  const params = new URLSearchParams();

  if (query.page) params.set("page", String(query.page));
  if (query.per_page) params.set("per_page", String(query.per_page));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.kb_status) params.set("kb_status", query.kb_status);

  const queryString = params.toString();
  const endpoint = queryString ? `/kb/sources?${queryString}` : "/kb/sources";

  return wpRestCall<KBSourcesResponse>(endpoint);
}

/**
 * Search posts by title or ID
 */
export async function searchPosts(
  query: string,
  limit = 10,
): Promise<
  Array<{
    post_id: number;
    post_title: string;
    post_type: string;
    post_type_label: string;
    post_status: string;
    post_excerpt: string;
    featured_image_url: string | null;
  }>
> {
  const params = new URLSearchParams({
    ...(query ? { query } : {}),
    limit: String(limit),
  });
  return wpRestCall(`/kb/posts/search?${params.toString()}`);
}

/**
 * Get KB data for a specific post
 */
export async function fetchKBPostData(postId: number): Promise<KBPostData> {
  return wpRestCall<KBPostData>(`/kb/posts/${postId}`);
}

/**
 * Enable/disable post as KB source
 */
export async function updateKBSource(
  postId: number,
  data: KBSourceEnableRequest,
): Promise<KBApiResponse> {
  return wpRestCall<KBApiResponse>(`/kb/posts/${postId}/source`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Save override for a section
 */
export async function saveKBOverride(
  postId: number,
  data: KBOverrideSaveRequest,
): Promise<KBApiResponse> {
  return wpRestCall<KBApiResponse>(`/kb/posts/${postId}/overrides`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete override for a section
 */
export async function deleteKBOverride(
  postId: number,
  data: KBOverrideDeleteRequest,
): Promise<KBApiResponse> {
  return wpRestCall<KBApiResponse>(`/kb/posts/${postId}/overrides`, {
    method: "DELETE",
    body: JSON.stringify(data),
  });
}

/**
 * Regenerate KB content for a post
 */
export async function regenerateKBPost(postId: number): Promise<KBApiResponse> {
  return wpRestCall<KBApiResponse>(`/kb/posts/${postId}/regenerate`, {
    method: "POST",
  });
}

/**
 * Re-enable a disabled KB source and regenerate its content
 * Preserves existing publish state (S3 published status)
 */
export async function reenableKBSource(postId: number): Promise<KBApiResponse> {
  return wpRestCall<KBApiResponse>(`/kb/posts/${postId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({
      reenable: true,
      preserve_publish_state: true,
    }),
  });
}

/**
 * Approve KB post for publishing (mark as reviewed)
 * Changes status from 'needs_review' to 'ready_to_publish'
 */
export async function approveKBPost(postId: number): Promise<{
  success: boolean;
  message: string;
  results: Array<{ doc_id: string; success: boolean; effective_hash: string }>;
  docs_approved: number;
}> {
  return wpRestCall(`/kb/posts/${postId}/approve`, {
    method: "POST",
  });
}

/**
 * Publish KB document
 */
export async function publishKBDocument(
  postId: number,
  data: KBPublishRequest,
): Promise<KBPublishResponse> {
  return wpRestCall<KBPublishResponse>(`/kb/posts/${postId}/publish`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Get KB settings
 */
export async function fetchKBSettings(): Promise<KBSettings> {
  return wpRestCall<KBSettings>("/kb/settings");
}

/**
 * Update KB settings
 */
export async function updateKBSettings(
  data: KBSettingsUpdateRequest,
): Promise<KBSettingsResponse> {
  return wpRestCall<KBSettingsResponse>("/kb/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Derive metadata config structure from existing KB sources
 * Returns YAML format showing categories, subcategories, and tags found in KB
 */
export async function deriveMetadataFromSources(): Promise<{
  success: boolean;
  yaml: string;
  stats: {
    categories: number;
    tags: number;
    total_sections_analyzed: number;
  };
}> {
  return wpRestCall("/kb/metadata-config/derive");
}

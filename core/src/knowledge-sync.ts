export const KNOWLEDGE_SYNC_CONTRACT_VERSION = 1 as const;

export type KnowledgeSyncOperation = "upsert" | "delete";
export type KnowledgeSyncReviewPolicy =
  | "wordpress-publish-is-approval"
  | "manual-kb-review"
  | "disabled";

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

interface KnowledgeSyncProjectionBaseV1 {
  schemaVersion: typeof KNOWLEDGE_SYNC_CONTRACT_VERSION;
  source: KnowledgeSyncSourceIdentityV1;
  sourceVersion: string;
  correlationId: string;
  observedAt: string;
}

export type PublicContentProjectionV1 = KnowledgeSyncProjectionBaseV1 &
  (
    | {
        operation: "upsert";
        document: KnowledgeSyncDocumentV1;
      }
    | {
        operation: "delete";
        document: null;
        lastPublicUrl?: string;
      }
  );

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

export class KnowledgeSyncContractError extends Error {
  constructor(
    public readonly code: string,
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeSyncContractError";
  }
}

function fail(code: string, field: string, message: string): never {
  throw new KnowledgeSyncContractError(code, field, message);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_type", field, `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function strictKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) {
    fail(
      "unknown_field",
      `${field}.${unknown}`,
      `${field}.${unknown} is not part of contract v1.`,
    );
  }
}

function stringValue(
  value: unknown,
  field: string,
  pattern?: RegExp,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail("invalid_string", field, `${field} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) {
    fail("invalid_format", field, `${field} has an invalid format.`);
  }
  return normalized;
}

function decimalId(value: unknown, field: string): string {
  return stringValue(value, field, /^(?:0|[1-9][0-9]*)$/);
}

function timestamp(value: unknown, field: string): string {
  const normalized = stringValue(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    fail("invalid_timestamp", field, `${field} must be an ISO-8601 timestamp.`);
  }
  return normalized;
}

function absoluteHttpUrl(value: unknown, field: string): string {
  const normalized = stringValue(value, field);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    fail("invalid_url", field, `${field} must be an absolute HTTP(S) URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("invalid_url", field, `${field} must be an absolute HTTP(S) URL.`);
  }
  return normalized;
}

function parseSource(value: unknown): KnowledgeSyncSourceIdentityV1 {
  const source = record(value, "source");
  strictKeys(
    source,
    ["producer", "siteId", "blogId", "postType", "postId"],
    "source",
  );
  if (source.producer !== "wordpress") {
    fail("unsupported_producer", "source.producer", "Only wordpress is supported in v1.");
  }
  return {
    producer: "wordpress",
    siteId: stringValue(source.siteId, "source.siteId", /^[A-Za-z0-9._:-]+$/),
    blogId: decimalId(source.blogId, "source.blogId"),
    postType: stringValue(source.postType, "source.postType", /^[a-z0-9_-]+$/),
    postId: decimalId(source.postId, "source.postId"),
  };
}

function parseMetadataTerm(
  value: unknown,
  index: number,
): KnowledgeSyncMetadataTermV1 {
  const field = `document.metadata[${index}]`;
  const term = record(value, field);
  strictKeys(term, ["namespace", "slug", "label"], field);
  return {
    namespace: stringValue(term.namespace, `${field}.namespace`, /^[a-z0-9_.:-]+$/),
    slug: stringValue(term.slug, `${field}.slug`, /^[a-z0-9][a-z0-9._-]*$/),
    label: stringValue(term.label, `${field}.label`),
  };
}

function parseDocument(value: unknown): KnowledgeSyncDocumentV1 {
  const document = record(value, "document");
  strictKeys(
    document,
    [
      "profile",
      "canonicalUrl",
      "title",
      "excerpt",
      "content",
      "contentType",
      "contentSha256",
      "modifiedGmt",
      "metadata",
    ],
    "document",
  );
  if (document.contentType !== "text/markdown") {
    fail(
      "unsupported_content_type",
      "document.contentType",
      "Contract v1 supports text/markdown documents only.",
    );
  }
  if (!Array.isArray(document.metadata)) {
    fail("invalid_type", "document.metadata", "document.metadata must be an array.");
  }
  return {
    profile: stringValue(document.profile, "document.profile", /^[a-z0-9][a-z0-9._-]*$/),
    canonicalUrl: absoluteHttpUrl(document.canonicalUrl, "document.canonicalUrl"),
    title: stringValue(document.title, "document.title"),
    excerpt: typeof document.excerpt === "string" ? document.excerpt : "",
    content: stringValue(document.content, "document.content"),
    contentType: "text/markdown",
    contentSha256: stringValue(
      document.contentSha256,
      "document.contentSha256",
      /^[a-f0-9]{64}$/,
    ),
    modifiedGmt: timestamp(document.modifiedGmt, "document.modifiedGmt"),
    metadata: document.metadata.map(parseMetadataTerm),
  };
}

export function parsePublicContentProjectionV1(
  value: unknown,
  boundary?: KnowledgeSyncBoundary,
): PublicContentProjectionV1 {
  const projection = record(value, "projection");
  strictKeys(
    projection,
    [
      "schemaVersion",
      "source",
      "sourceVersion",
      "correlationId",
      "observedAt",
      "operation",
      "document",
      "lastPublicUrl",
    ],
    "projection",
  );
  if (projection.schemaVersion !== KNOWLEDGE_SYNC_CONTRACT_VERSION) {
    fail("unsupported_schema", "projection.schemaVersion", "Unsupported contract version.");
  }
  const source = parseSource(projection.source);
  if (
    boundary &&
    (source.producer !== boundary.producer || source.siteId !== boundary.siteId)
  ) {
    fail(
      "source_boundary_mismatch",
      "projection.source",
      "Projection source does not match the authenticated producer boundary.",
    );
  }
  const base = {
    schemaVersion: KNOWLEDGE_SYNC_CONTRACT_VERSION,
    source,
    sourceVersion: decimalId(projection.sourceVersion, "projection.sourceVersion"),
    correlationId: stringValue(
      projection.correlationId,
      "projection.correlationId",
      /^[A-Za-z0-9._:-]+$/,
    ),
    observedAt: timestamp(projection.observedAt, "projection.observedAt"),
  };
  if (projection.operation === "upsert") {
    if ("lastPublicUrl" in projection) {
      fail(
        "unknown_field",
        "projection.lastPublicUrl",
        "lastPublicUrl is valid only for delete projections.",
      );
    }
    return { ...base, operation: "upsert", document: parseDocument(projection.document) };
  }
  if (projection.operation === "delete") {
    if (projection.document !== null) {
      fail("invalid_delete", "projection.document", "Delete projections require document=null.");
    }
    return {
      ...base,
      operation: "delete",
      document: null,
      ...(projection.lastPublicUrl !== undefined
        ? { lastPublicUrl: absoluteHttpUrl(projection.lastPublicUrl, "projection.lastPublicUrl") }
        : {}),
    };
  }
  return fail("invalid_operation", "projection.operation", "Unsupported desired operation.");
}

export function parseKnowledgeSyncPolicyV1(value: unknown): KnowledgeSyncPolicyV1 {
  const policy = record(value, "policy");
  strictKeys(
    policy,
    [
      "schemaVersion",
      "postType",
      "enabled",
      "autoEnableSource",
      "reviewPolicy",
      "onPublish",
      "onPublishedUpdate",
      "onUnpublish",
      "metadataRefresh",
      "includeTaxonomies",
      "documentProfile",
    ],
    "policy",
  );
  if (policy.schemaVersion !== KNOWLEDGE_SYNC_CONTRACT_VERSION) {
    fail("unsupported_schema", "policy.schemaVersion", "Unsupported policy version.");
  }
  if (typeof policy.enabled !== "boolean") {
    fail("invalid_type", "policy.enabled", "policy.enabled must be boolean.");
  }
  if (
    policy.autoEnableSource !== "administrator" &&
    policy.autoEnableSource !== "migration" &&
    policy.autoEnableSource !== "system"
  ) {
    fail("invalid_policy", "policy.autoEnableSource", "Invalid auto-enable source.");
  }
  if (
    policy.reviewPolicy !== "wordpress-publish-is-approval" &&
    policy.reviewPolicy !== "manual-kb-review" &&
    policy.reviewPolicy !== "disabled"
  ) {
    fail("invalid_policy", "policy.reviewPolicy", "Invalid review policy.");
  }
  if (
    policy.onPublish !== "upsert" ||
    policy.onPublishedUpdate !== "upsert" ||
    policy.onUnpublish !== "delete" ||
    policy.metadataRefresh !== "reconcile"
  ) {
    fail("invalid_policy", "policy", "Unsupported policy action in contract v1.");
  }
  if (!Array.isArray(policy.includeTaxonomies)) {
    fail(
      "invalid_type",
      "policy.includeTaxonomies",
      "policy.includeTaxonomies must be an array.",
    );
  }
  const includeTaxonomies = [
    ...new Set(
      policy.includeTaxonomies.map((taxonomy, index) =>
        stringValue(
          taxonomy,
          `policy.includeTaxonomies[${index}]`,
          /^[a-z0-9_-]+$/,
        ),
      ),
    ),
  ].sort();
  return {
    schemaVersion: KNOWLEDGE_SYNC_CONTRACT_VERSION,
    postType: stringValue(policy.postType, "policy.postType", /^[a-z0-9_-]+$/),
    enabled: policy.enabled,
    autoEnableSource: policy.autoEnableSource,
    reviewPolicy: policy.reviewPolicy,
    onPublish: "upsert",
    onPublishedUpdate: "upsert",
    onUnpublish: "delete",
    metadataRefresh: "reconcile",
    includeTaxonomies,
    documentProfile: stringValue(
      policy.documentProfile,
      "policy.documentProfile",
      /^[a-z0-9][a-z0-9._-]*$/,
    ),
  };
}

export function compareKnowledgeSourceVersions(
  candidate: string,
  accepted: string,
): SourceVersionOrder {
  const candidateVersion = BigInt(decimalId(candidate, "candidateSourceVersion"));
  const acceptedVersion = BigInt(decimalId(accepted, "acceptedSourceVersion"));
  return candidateVersion < acceptedVersion
    ? "older"
    : candidateVersion > acceptedVersion
      ? "newer"
      : "same";
}

export function knowledgeSyncSourceKey(
  source: KnowledgeSyncSourceIdentityV1,
): string {
  const parsed = parseSource(source);
  return [
    parsed.producer,
    parsed.siteId,
    parsed.blogId,
    parsed.postType,
    parsed.postId,
  ]
    .map(encodeURIComponent)
    .join(":");
}

import type { ConnectionServer, ConnectionSetupCatalog } from "../answers/connection-types";
/** The fields used by Answers; premium clients may return additional fields. */
export interface ConversationProfile {
  identity: { assistantName?: string; role: string; sitePurpose: string; audience?: string };
  context: { markdown: string };
  guidance: { primaryGoals: string[] };
  response: { tone: string; presentation?: import("@smart-cloud/ai-kit-core").AnswerPresentationPolicy };
  tools: {
    knowledgeBase: { enabled: boolean; metadataPolicy?: "inherit" | "profile" };
    externalMcpServers?: ConnectionServer[];
    webGrounding?: { enabled: boolean; allowedUrlPrefixes: string[] };
  };
  grounding?: { defaultRequirement: "none" | "preferred" | "required"; missingEvidenceBehavior: "ask" | "decline" | "general_knowledge_with_disclosure"; citationRequired: boolean; inheritMetadataCategoryPolicies: boolean };
}

export interface ConversationProfileResponse<Profile extends ConversationProfile = ConversationProfile> {
  configured: boolean;
  setup?: ConnectionSetupCatalog;
  document: {
    revision: string | null;
    profile: Profile;
  };
}

export interface KnowledgeSyncPolicy {
  schemaVersion: 1;
  postType: string;
  enabled: boolean;
  autoEnableSource: "administrator" | "migration" | "system";
  reviewPolicy: "disabled" | "wordpress-publish-is-approval" | "manual-kb-review";
  onPublish: "upsert";
  onPublishedUpdate: "upsert";
  onUnpublish: "delete";
  metadataRefresh: "reconcile";
  includeTaxonomies: string[];
  documentProfile: string;
  structuredContent?: {
    enabled: boolean;
    fields: import("@smart-cloud/ai-kit-core").StructuredContentFieldMapping[];
  };
}

export interface KnowledgeSyncStatus {
  policies: Record<string, KnowledgeSyncPolicy>;
  availablePostTypes: Array<{
    value: string;
    label: string;
    taxonomies: Array<{ value: string; label: string }>;
    structuredFields?: Array<import("@smart-cloud/ai-kit-core").StructuredContentFieldSchema & import("@smart-cloud/ai-kit-core").StructuredContentFieldSource>;
  }>;
}

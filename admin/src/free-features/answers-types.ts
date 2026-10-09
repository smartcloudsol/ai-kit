/** The fields used by Answers; premium clients may return additional fields. */
export interface ConversationProfile {
  identity: { assistantName?: string; role: string; sitePurpose: string };
  context: { markdown: string };
  guidance: { primaryGoals: string[] };
  response: { tone: string };
  tools: {
    knowledgeBase: { enabled: boolean };
  };
}

export interface ConversationProfileResponse<Profile extends ConversationProfile = ConversationProfile> {
  configured: boolean;
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
}

export interface KnowledgeSyncStatus {
  policies: Record<string, KnowledgeSyncPolicy>;
  availablePostTypes: Array<{
    value: string;
    label: string;
    taxonomies: Array<{ value: string; label: string }>;
  }>;
}

import type {
  ConversationProfile,
  ConversationProfileResponse,
  KnowledgeSyncPolicy,
  KnowledgeSyncStatus,
} from "../free-features/answers-types";

interface ProfileClient {
  getConversationProfile: () => Promise<ConversationProfileResponse | null>;
  updateConversationProfile: (
    profile: ConversationProfile,
    revision: string | null,
  ) => Promise<ConversationProfileResponse>;
}
interface KnowledgeClient {
  fetchKnowledgeSyncStatus: () => Promise<KnowledgeSyncStatus>;
  updateKnowledgeSyncPolicy: (
    postType: string,
    policy: KnowledgeSyncPolicy,
  ) => Promise<{ policy: KnowledgeSyncPolicy }>;
}

async function profileClient(): Promise<ProfileClient> {
  return import(
    process.env.WPSUITE_PREMIUM
      ? "../paid-features/conversation-profile/backend-client"
      : "../free-features/answers-profile-client"
  );
}

async function knowledgeClient(): Promise<KnowledgeClient> {
  return import(
    process.env.WPSUITE_PREMIUM
      ? "../paid-features/kb-admin/api-client"
      : "../free-features/answers-knowledge-client"
  );
}

export async function getConversationProfile(): Promise<ConversationProfileResponse | null> {
  return (await profileClient()).getConversationProfile();
}

export async function updateConversationProfile(
  profile: ConversationProfile,
  expectedRevision: string | null,
): Promise<ConversationProfileResponse> {
  return (await profileClient()).updateConversationProfile(profile, expectedRevision);
}

export async function fetchKnowledgeSyncStatus(): Promise<KnowledgeSyncStatus> {
  return (await knowledgeClient()).fetchKnowledgeSyncStatus();
}

export async function updateKnowledgeSyncPolicy(
  postType: string,
  policy: KnowledgeSyncPolicy,
): Promise<{ policy: KnowledgeSyncPolicy }> {
  return (await knowledgeClient()).updateKnowledgeSyncPolicy(postType, policy);
}

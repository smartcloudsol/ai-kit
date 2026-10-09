import type {
  ConversationProfile,
  ConversationProfileResponse,
} from "../free-features/answers-types";

/** The presentation title owns the name; assistantName remains a compatibility mirror. */
export function profileWithChatTitle<Profile extends ConversationProfile>(
  profile: Profile,
  title: string,
): Profile {
  if (title.trim().length > 120)
    throw new Error("Assistant name must be at most 120 characters.");
  return {
    ...profile,
    identity: { ...profile.identity, assistantName: title.trim() },
  };
}
export async function synchronizeChatTitle<Profile extends ConversationProfile>(
  title: string,
  read: () => Promise<ConversationProfileResponse<Profile>>,
  write: (
    profile: Profile,
    revision: string | null,
  ) => Promise<ConversationProfileResponse<Profile>>,
): Promise<boolean> {
  const current = await read();
  if (!current.configured) return false; // Never manufacture a profile from defaults.
  const next = profileWithChatTitle(current.document.profile, title);
  if (
    (current.document.profile.identity.assistantName || "") !==
    next.identity.assistantName
  ) {
    const saved = await write(next, current.document.revision);
    if ((saved.document.profile.identity.assistantName || "") !== (next.identity.assistantName || "")) {
      throw new Error("The backend did not confirm the assistant name. Reload before retrying.");
    }
  }
  return true;
}

import type { ConversationProfile, ConversationProfileResponse } from "./answers-types";

/** A free build does not read or modify the premium assistant profile. */
export async function getConversationProfile(): Promise<null> {
  return null;
}

export async function updateConversationProfile(
  _profile: ConversationProfile,
  _expectedRevision: string | null,
): Promise<ConversationProfileResponse> {
  void _profile;
  void _expectedRevision;
  throw new Error("Assistant behavior settings require the premium plugin build.");
}

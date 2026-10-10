import type { ConversationProfile, ConversationProfileResponse } from "./answers-types";
import type { ConnectionPreviewRequest, ConnectionPreview } from "../answers/connection-types";
import type { ProductPreviewRequest, ProductPreview } from "../answers/connection-types";

export async function previewConversationProducts(_request: ProductPreviewRequest): Promise<ProductPreview> {
  void _request;
  throw new Error("Product page links require the premium plugin build and a compatible backend.");
}

export async function previewConversationConnection(_request: ConnectionPreviewRequest): Promise<ConnectionPreview> {
  void _request;
  throw new Error("Guided connections require the premium plugin build and a compatible backend.");
}

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

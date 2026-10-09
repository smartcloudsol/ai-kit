import type { KnowledgeSyncPolicy, KnowledgeSyncStatus } from "./answers-types";

/** No premium knowledge synchronization is available in a free build. */
export async function fetchKnowledgeSyncStatus(): Promise<KnowledgeSyncStatus> {
  return { policies: {}, availablePostTypes: [] };
}

export async function updateKnowledgeSyncPolicy(
  _postType: string,
  _policy: KnowledgeSyncPolicy,
): Promise<{ policy: KnowledgeSyncPolicy }> {
  void _postType;
  void _policy;
  throw new Error("Knowledge synchronization requires the premium plugin build.");
}

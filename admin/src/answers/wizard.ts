import { profileWithChatTitle } from "./assistant-name.ts";
import type { Appearance, AnswersSettings } from "./client";
import type {
  ConversationProfile,
  ConversationProfileResponse,
  KnowledgeSyncPolicy,
  KnowledgeSyncStatus,
} from "../free-features/answers-types";

export interface AnswersDraft {
  appearance: Appearance;
  role: string;
  purpose: string;
  task: string;
  tone: string;
  context: string;
  selected: string[];
}
export interface WizardSnapshot {
  settings: AnswersSettings | null;
  profile: ConversationProfileResponse | null;
  knowledge: KnowledgeSyncStatus;
}
export function createDraft(snapshot: WizardSnapshot): AnswersDraft {
  const profile = snapshot.profile?.configured
    ? snapshot.profile.document.profile
    : null;
  return {
    appearance: {
      enableChatbot: false,
      title: "",
      greeting: "",
      placeholder: "",
      openButtonPosition: "bottom-right",
      brandColor: "",
      ...snapshot.settings?.values,
    },
    role: profile?.identity.role ?? "",
    purpose: profile?.identity.sitePurpose ?? "",
    task: profile?.guidance.primaryGoals.join("\n") ?? "",
    tone: profile?.response.tone ?? "Helpful and clear",
    context: profile?.context.markdown ?? "",
    selected: Object.entries(snapshot.knowledge.policies)
      .filter(
        ([, policy]) => policy.enabled && policy.reviewPolicy !== "disabled",
      )
      .map(([type]) => type),
  };
}
export function appearancePatch(
  draft: AnswersDraft,
  snapshot: WizardSnapshot,
): Partial<Appearance> {
  const result: Partial<Appearance> = {};
  const current = createDraft(snapshot).appearance;
  for (const key of Object.keys(draft.appearance) as (keyof Appearance)[]) {
    if (draft.appearance[key] !== current[key])
      Object.assign(result, { [key]: draft.appearance[key] });
  }
  return result;
}
export function profilePatch(
  draft: AnswersDraft,
  snapshot: WizardSnapshot,
): ConversationProfile | null {
  if (!snapshot.profile || !draft.appearance.enableChatbot) return null;
  const current = snapshot.profile.document.profile;
  const next: ConversationProfile = {
    ...current,
    identity: {
      ...profileWithChatTitle(current, draft.appearance.title).identity,
      role: draft.role.trim(),
      sitePurpose: draft.purpose.trim(),
    },
    guidance: {
      ...current.guidance,
      primaryGoals: draft.task
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    },
    response: { ...current.response, tone: draft.tone.trim() },
    context: { ...current.context, markdown: draft.context.trim() },
    tools: !snapshot.profile.configured
      ? {
          ...current.tools,
          knowledgeBase: { ...current.tools.knowledgeBase, enabled: true },
        }
      : current.tools,
  };
  return !snapshot.profile.configured ||
    JSON.stringify(next) !== JSON.stringify(current)
    ? next
    : null;
}
export function policyPatches(
  draft: AnswersDraft,
  snapshot: WizardSnapshot,
): Record<string, KnowledgeSyncPolicy> {
  const result: Record<string, KnowledgeSyncPolicy> = {};
  for (const type of snapshot.knowledge.availablePostTypes) {
    const current = snapshot.knowledge.policies[type.value];
    const enabled = !!current?.enabled && current.reviewPolicy !== "disabled";
    const selected = draft.selected.includes(type.value);
    if (enabled === selected) continue;
    const base: KnowledgeSyncPolicy = current ?? {
      schemaVersion: 1,
      postType: type.value,
      enabled: false,
      autoEnableSource: "administrator",
      reviewPolicy: "wordpress-publish-is-approval",
      onPublish: "upsert",
      onPublishedUpdate: "upsert",
      onUnpublish: "delete",
      metadataRefresh: "reconcile",
      includeTaxonomies: [],
      documentProfile: "default",
    };
    result[type.value] = {
      ...base,
      enabled: selected,
      ...(selected
        ? {
            reviewPolicy:
              base.reviewPolicy !== "disabled"
                ? base.reviewPolicy
                : "wordpress-publish-is-approval",
            includeTaxonomies: base.includeTaxonomies.length
              ? base.includeTaxonomies
              : type.taxonomies.map((taxonomy) => taxonomy.value),
          }
        : {}),
    };
  }
  return result;
}

export interface SaveServices {
  readKnowledge: () => Promise<KnowledgeSyncStatus>;
  savePolicy: (
    type: string,
    policy: KnowledgeSyncPolicy,
  ) => Promise<{ policy: KnowledgeSyncPolicy }>;
  saveProfile: (
    profile: ConversationProfile,
    revision: string | null,
  ) => Promise<ConversationProfileResponse>;
  saveAppearance: (
    revision: string,
    values: Partial<Appearance>,
  ) => Promise<AnswersSettings>;
}
/** Independent canonical stores: advance successful baselines, never pretend rollback is atomic. */
export async function saveWizard(
  draft: AnswersDraft,
  snapshot: WizardSnapshot,
  services: SaveServices,
  progress: (snapshot: WizardSnapshot, label: string) => void,
): Promise<WizardSnapshot> {
  let next = {
    ...snapshot,
    knowledge: {
      ...snapshot.knowledge,
      policies: { ...snapshot.knowledge.policies },
    },
  };
  const policies = policyPatches(draft, snapshot);
  const appearance = appearancePatch(draft, snapshot);
  const profile = profilePatch(draft, snapshot);
  if (Object.keys(appearance).length && !snapshot.settings?.connected)
    throw new Error("Connect this site before saving assistant appearance.");
  // Preflight local policies before any write. Existing endpoint has no atomic CAS.
  if (Object.keys(policies).length) {
    const fresh = await services.readKnowledge();
    for (const type of Object.keys(policies)) {
      if (
        JSON.stringify(fresh.policies[type] ?? null) !==
        JSON.stringify(snapshot.knowledge.policies[type] ?? null)
      )
        throw new Error(
          "Content settings changed elsewhere. Reload setup before saving; your edits are retained.",
        );
    }
  }
  if (profile && snapshot.profile) {
    next = {
      ...next,
      profile: await services.saveProfile(
        profile,
        snapshot.profile.document.revision,
      ),
    };
    progress(next, "Assistant behavior saved");
  }
  for (const [type, policy] of Object.entries(policies)) {
    const saved = await services.savePolicy(type, policy);
    next = {
      ...next,
      knowledge: {
        ...next.knowledge,
        policies: { ...next.knowledge.policies, [type]: saved.policy },
      },
    };
    progress(next, `Content selection saved: ${type}`);
  }
  // Appearance includes activation and is deliberately last.
  if (Object.keys(appearance).length) {
    if (!snapshot.settings?.connected)
      throw new Error(
        "Connect this site before saving assistant appearance. Completed content changes are retained.",
      );
    next = {
      ...next,
      settings: await services.saveAppearance(
        snapshot.settings.revision,
        appearance,
      ),
    };
    progress(next, "Assistant appearance saved");
  }
  return next;
}

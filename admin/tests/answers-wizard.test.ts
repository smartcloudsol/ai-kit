import assert from "node:assert/strict";
import test from "node:test";
import {
  appearancePatch,
  createDraft,
  policyPatches,
  profilePatch,
  saveWizard,
  type WizardSnapshot,
} from "../src/answers/wizard.ts";
const fixture = (): WizardSnapshot =>
  ({
    settings: {
      connected: true,
      revision: "r1",
      plan: "pro",
      backend_configured: true,
      can_edit_pages: true,
      preview_url: "https://example.test",
      values: {
        enableChatbot: true,
        title: "Display title",
        greeting: "Welcome",
        placeholder: "Ask",
      },
    },
    profile: {
      configured: true,
      document: {
        revision: "p1",
        profile: {
          identity: {
            assistantName: "Different internal name",
            role: "Guide",
            sitePurpose: "Products",
          },
          guidance: { primaryGoals: ["Help"], conversionGoals: ["Preserve"] },
          response: { tone: "Clear", defaultLanguage: "auto" },
          context: { markdown: "Facts" },
          tools: {
            knowledgeBase: { enabled: false, maxResults: 3 },
            calculator: { enabled: true },
          },
          future: "preserved",
        },
      },
    },
    knowledge: {
      policies: {},
      availablePostTypes: [
        {
          value: "post",
          label: "Posts",
          taxonomies: [{ value: "category", label: "Categories" }],
        },
        { value: "page", label: "Pages", taxonomies: [] },
      ],
    },
  }) as unknown as WizardSnapshot;

test("replay derives conversation name from presentation while preserving the disabled KB tool", () => {
  const snapshot = fixture();
  const draft = createDraft(snapshot);
  assert.deepEqual(appearancePatch(draft, snapshot), {});
  assert.equal(
    profilePatch(draft, snapshot)!.identity.assistantName,
    "Display title",
  );
  assert.deepEqual(policyPatches(draft, snapshot), {});
  draft.appearance.title = "Shared name";
  const profile = profilePatch(draft, snapshot)!;
  assert.equal(profile.identity.assistantName, "Shared name");
  assert.equal(profile.tools.knowledgeBase.enabled, false);
  assert.deepEqual(profile.guidance.conversionGoals, ["Preserve"]);
  assert.equal(appearancePatch(draft, snapshot).title, "Shared name");
});
test("new profile enables knowledge tool; existing profiles and unrelated settings survive", () => {
  const snapshot = fixture();
  snapshot.profile!.configured = false;
  const draft = createDraft(snapshot);
  assert.equal(draft.role, "");
  assert.equal(draft.purpose, "");
  draft.role = "Site guide";
  draft.purpose = "Documentation";
  const profile = profilePatch(draft, snapshot)!;
  assert.equal(profile.tools.knowledgeBase.enabled, true);
  assert.equal(profile.tools.knowledgeBase.maxResults, 3);
  assert.equal(profile.tools.calculator.enabled, true);
});
test("source selection uses only public taxonomy catalog and preserves existing manual policy", () => {
  const snapshot = fixture();
  const draft = createDraft(snapshot);
  draft.selected = ["post"];
  const policy = policyPatches(draft, snapshot).post;
  assert.deepEqual(policy.includeTaxonomies, ["category"]);
  assert.equal(policy.reviewPolicy, "wordpress-publish-is-approval");
  snapshot.knowledge.policies.post = {
    ...policy,
    reviewPolicy: "manual-kb-review",
    documentProfile: "custom",
  };
  assert.deepEqual(policyPatches(draft, snapshot), {});
  draft.selected = [];
  assert.equal(policyPatches(draft, snapshot).post.enabled, false);
  assert.equal(policyPatches(draft, snapshot).post.documentProfile, "custom");
});
test("partial save retries remaining stores without repeating successful profile/source writes", async () => {
  let snapshot = fixture();
  const draft = createDraft(snapshot);
  draft.appearance.title = "New name";
  draft.selected = ["post"];
  const calls: string[] = [];
  let failAppearance = true;
  const services = {
    readKnowledge: async () => snapshot.knowledge,
    saveProfile: async (
      profile: NonNullable<WizardSnapshot["profile"]>["document"]["profile"],
    ) => {
      calls.push("profile");
      return {
        ...snapshot.profile!,
        document: { ...snapshot.profile!.document, revision: "p2", profile },
      };
    },
    savePolicy: async (
      type: string,
      policy: WizardSnapshot["knowledge"]["policies"][string],
    ) => {
      calls.push(type);
      return { policy };
    },
    saveAppearance: async (_revision: string, values: object) => {
      calls.push("appearance");
      if (failAppearance) throw new Error("503");
      return {
        ...snapshot.settings!,
        revision: "r2",
        values: { ...snapshot.settings!.values, ...values },
      };
    },
  };
  await assert.rejects(
    saveWizard(draft, snapshot, services, (value) => {
      snapshot = value;
    }),
    /503/,
  );
  assert.deepEqual(calls, ["profile", "post", "appearance"]);
  failAppearance = false;
  await saveWizard(draft, snapshot, services, (value) => {
    snapshot = value;
  });
  assert.deepEqual(calls, ["profile", "post", "appearance", "appearance"]);
  assert.equal(snapshot.settings!.values.title, "New name");
});
test("content conflict preflight aborts before any write", async () => {
  const snapshot = fixture();
  const draft = createDraft(snapshot);
  draft.selected = ["post"];
  draft.role = "Changed";
  let writes = 0;
  await assert.rejects(
    saveWizard(
      draft,
      snapshot,
      {
        readKnowledge: async () => ({
          ...snapshot.knowledge,
          policies: policyPatches(draft, snapshot),
        }),
        saveProfile: async () => {
          writes++;
          return snapshot.profile!;
        },
        savePolicy: async () => {
          writes++;
          throw new Error("unexpected");
        },
        saveAppearance: async () => {
          writes++;
          return snapshot.settings!;
        },
      },
      () => {},
    ),
    /changed elsewhere/,
  );
  assert.equal(writes, 0);
});

test("detailed title save mirrors canonical name, preserves profile settings and surfaces revision conflicts", async () => {
  const { synchronizeChatTitle, profileWithChatTitle } = await import(
    "../src/answers/assistant-name.ts"
  );
  const current = fixture().profile!;
  const writes: Array<{ profile: unknown; revision: string | null }> = [];
  await synchronizeChatTitle(
    "Canonical chat title",
    async () => current,
    async (profile, revision) => {
      writes.push({ profile, revision });
      return { ...current, document: { ...current.document, profile } };
    },
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].revision, "p1");
  assert.equal(
    (writes[0].profile as typeof current.document.profile).identity
      .assistantName,
    "Canonical chat title",
  );
  assert.deepEqual(
    (writes[0].profile as typeof current.document.profile).tools,
    current.document.profile.tools,
  );
  await assert.rejects(
    synchronizeChatTitle(
      "New title",
      async () => current,
      async () => {
        throw new Error("409 revision conflict");
      },
    ),
    /409/,
  );
  assert.equal(
    await synchronizeChatTitle(
      "New title",
      async () => ({ ...current, configured: false }),
      async () => {
        throw new Error("Must not create a profile");
      },
    ),
    false,
  );
  assert.throws(
    () => profileWithChatTitle(current.document.profile, "x".repeat(121)),
    /120/,
  );
});

test('cleared title clears the compatibility name; backend nonconfirmation is not success', async () => {
  const { synchronizeChatTitle } = await import('../src/answers/assistant-name.ts');
  const current = fixture().profile!;
  await synchronizeChatTitle('', async () => current, async (profile) => {
    assert.equal(profile.identity.assistantName, '');
    return { ...current, document: { ...current.document, profile } };
  });
  await assert.rejects(synchronizeChatTitle('New name', async () => current, async () => current), /did not confirm/);
});

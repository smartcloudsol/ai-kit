import assert from "node:assert/strict";
import test from "node:test";
import {
  ANSWERS_PROFILE_PRESETS,
  PROFILE_PRESET_INPUT_LIMITS,
  applyProfilePresetPreview,
  buildProfilePresetPreview,
  type ProfilePresetInputs,
  type ProfilePresetPreview,
} from "../src/answers/profile-presets.ts";
import { createDraft, profilePatch, type WizardSnapshot } from "../src/answers/wizard.ts";

const inputs = (): ProfilePresetInputs => ({
  siteName: "Northstar",
  sitePurpose: "Help visitors find outdoor equipment and its care guides.",
  audience: "Visitors comparing equipment for winter trips.",
  portfolio: "Snowboards\nProtective equipment\nCare guides",
});

function successful(preview: ProfilePresetPreview) {
  assert.equal(preview.ok, true);
  if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
  return preview;
}

const snapshot = (): WizardSnapshot => ({
  settings: null,
  knowledge: { policies: {}, availablePostTypes: [] },
  profile: {
    configured: true,
    document: {
      revision: "r1",
      profile: {
        identity: { role: "Current role", sitePurpose: "Current purpose", audience: "Current audience" },
        guidance: { primaryGoals: ["Current task"], conversionGoals: ["Keep conversion goal"] },
        response: { tone: "Current tone", defaultLanguage: "fr" },
        context: { markdown: "Owner's support instructions.\nKeep this exact text." },
        tools: { knowledgeBase: { enabled: false }, externalMcpServers: [{ id: "keep-connection", enabled: true }] },
        model: { modelId: "keep-model" },
        scope: { allowedTopics: ["Owner-defined scope"] },
        grounding: { citationRequired: true },
        safety: { guardrailIdentifier: "keep-guardrail" },
        memory: { preserveEvidenceReferences: true },
        actions: [{ id: "keep-action" }],
      },
    },
  },
}) as unknown as WizardSnapshot;

test("four authored previews contain concrete supplied context without fabricated business facts", () => {
  for (const preset of ANSWERS_PROFILE_PRESETS) {
    const { values } = successful(buildProfilePresetPreview(preset.id, inputs(), { context: "" }));
    assert.match(values.role, /Northstar/);
    assert.equal(values.purpose, inputs().sitePurpose);
    assert.equal(values.audience, inputs().audience);
    assert.match(values.context, /Snowboards\nProtective equipment/);
    assert.match(values.context, /not an exhaustive catalog/);
    assert.doesNotMatch(JSON.stringify(values), /\{\{|\}\}|example\.com|free shipping|24\/7/);
    assert.ok(values.role.length <= 2000);
    assert.ok(values.tone.length <= 500);
    const tasks = values.task.split("\n");
    assert.ok(tasks.length <= 50 && tasks.every((item) => item.length <= 500));
  }
});

test("preview and application preserve unrelated draft settings and do not mutate inputs", () => {
  const original = createDraft(snapshot());
  original.appearance.enableChatbot = true;
  original.appearance.title = "Owner chat title";
  original.selected = ["post"];
  const before = structuredClone(original);
  const site = inputs();
  const siteBefore = structuredClone(site);
  const preview = successful(buildProfilePresetPreview("product-discovery", site, original));
  assert.deepEqual(original, before);
  assert.deepEqual(site, siteBefore);
  const applied = applyProfilePresetPreview(original, preview);
  assert.deepEqual(applied.appearance, before.appearance);
  assert.deepEqual(applied.selected, before.selected);
  assert.ok(applied.context.startsWith(before.context));
  assert.equal(applied.audience, site.audience);
  assert.deepEqual(original, before);
});

test("rerun keeps advanced profile sections and portfolio never becomes a scope whitelist", () => {
  const source = snapshot();
  const draft = createDraft(source);
  draft.appearance.enableChatbot = true;
  const next = applyProfilePresetPreview(draft, successful(buildProfilePresetPreview("product-discovery", inputs(), draft)));
  const patched = profilePatch(next, source)!;
  assert.equal(patched.identity.audience, inputs().audience);
  for (const key of ["tools", "model", "scope", "grounding", "safety", "memory", "actions"] as const) {
    assert.deepEqual((patched as unknown as Record<string, unknown>)[key], (source.profile!.document.profile as unknown as Record<string, unknown>)[key]);
  }
  assert.deepEqual((patched.guidance as unknown as Record<string, unknown>).conversionGoals, ["Keep conversion goal"]);
  assert.equal((patched.response as unknown as Record<string, unknown>).defaultLanguage, "fr");
});

test("reopening and selecting another preset replaces only the generated section", () => {
  const existing = "Owner prefix\n\n";
  const first = successful(buildProfilePresetPreview("site-guide", inputs(), { context: existing }));
  const withOwnerSuffix = `${first.values.context}\n\nOwner suffix after setup.`;
  const same = successful(buildProfilePresetPreview("site-guide", inputs(), { context: withOwnerSuffix }));
  assert.equal(same.values.context, withOwnerSuffix);
  const changed = successful(buildProfilePresetPreview("services", { ...inputs(), portfolio: "Repair services" }, { context: same.values.context }));
  assert.ok(changed.values.context.startsWith(existing));
  assert.ok(changed.values.context.endsWith("\n\nOwner suffix after setup."));
  assert.match(changed.values.context, /Repair services/);
  assert.doesNotMatch(changed.values.context, /Snowboards/);
  assert.equal(changed.values.context.split("<!-- wpsuite:answers-preset-context:start -->").length, 2);
});

test("blank required inputs and every oversized input produce field errors", () => {
  for (const key of ["siteName", "sitePurpose"] as const) {
    const result = buildProfilePresetPreview("site-guide", { ...inputs(), [key]: " \n " }, { context: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[key]!, /required/);
  }
  for (const key of Object.keys(PROFILE_PRESET_INPUT_LIMITS) as (keyof ProfilePresetInputs)[]) {
    const result = buildProfilePresetPreview("services", { ...inputs(), [key]: "x".repeat(PROFILE_PRESET_INPUT_LIMITS[key] + 1) }, { context: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[key]!, /at most/);
  }
  const optionalBlank = successful(buildProfilePresetPreview("customer-support", { ...inputs(), audience: "", portfolio: "" }, { context: "" }));
  assert.equal(optionalBlank.values.audience, "");
  assert.doesNotMatch(optionalBlank.values.context, /Audience:|Topics and portfolio/);
});

test("oversized combined context is rejected instead of truncated", () => {
  const result = buildProfilePresetPreview("site-guide", inputs(), { context: "x".repeat(49990) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.context!, /50,000/);
});

test("malformed managed sections and control text never silently delete owner context", () => {
  for (const context of [
    "Owner text <!-- wpsuite:answers-preset-context:start --> unfinished",
    "<!-- wpsuite:answers-preset-context:end --> owner text",
    "<!-- wpsuite:answers-preset-context:start --><!-- wpsuite:answers-preset-context:end --><!-- wpsuite:answers-preset-context:start -->",
  ]) {
    const result = buildProfilePresetPreview("site-guide", inputs(), { context });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.context!, /markers/);
  }
  for (const siteName of ["North\u0000star", "<!-- wpsuite:answers-preset-context:start -->"]) {
    const result = buildProfilePresetPreview("site-guide", { ...inputs(), siteName }, { context: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.siteName!, /unsupported/);
  }
  const unresolved = buildProfilePresetPreview("site-guide", { ...inputs(), sitePurpose: "Help {{audience}}" }, { context: "" });
  assert.equal(unresolved.ok, false);
  if (!unresolved.ok) assert.match(unresolved.errors.sitePurpose!, /placeholders/);
});

test("current or absent preset does not apply a preset automatically", () => {
  const draft = createDraft(snapshot());
  assert.equal(draft.role, "Current role");
  assert.equal(draft.audience, "Current audience");
  assert.equal(draft.context, snapshot().profile!.document.profile.context.markdown);
  for (const id of ["", "current", "unknown-preset"]) {
    const result = buildProfilePresetPreview(id, inputs(), draft);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.preset!, /Choose/);
  }
});

test("clearing an audience is an explicit guided-field patch", () => {
  const source = snapshot();
  const draft = createDraft(source);
  draft.appearance.enableChatbot = true;
  draft.audience = "";
  assert.equal(profilePatch(draft, source)!.identity.audience, undefined);
  assert.equal(source.profile!.document.profile.identity.audience, "Current audience");
});

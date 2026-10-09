import classes from "../main.module.css";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  getAiKitPlugin,
  getStoreSelect,
  reloadConfig,
  resolveBackend,
  type Store,
} from "@smart-cloud/ai-kit-core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConversationProfile,
  updateConversationProfile,
  fetchKnowledgeSyncStatus,
  updateKnowledgeSyncPolicy,
} from "./backend-clients";
import { requestOnboarding, requestSettings } from "./client";
import {
  appearancePatch,
  createDraft,
  policyPatches,
  profilePatch,
  saveWizard,
  type AnswersDraft,
  type WizardSnapshot,
} from "./wizard";

export interface AnswersContext {
  openHelp: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
const steps = ["Assistant", "Appearance", "Behavior", "Content", "Review"];
export default function Answers({
  store,
  context,
}: {
  store: Store;
  context: AnswersContext;
}) {
  const plugin = getAiKitPlugin();
  // A confirmed reset reloads this page with setup=1. Cloud-managed settings
  // deliberately survive that reset, so configured status alone cannot open it.
  const setupRequested = useRef(new URLSearchParams(location.search).get("setup") === "1");
  const [snapshot, setSnapshot] = useState<WizardSnapshot | null>(null);
  const [draft, setDraft] = useState<AnswersDraft | null>(null);
  const [step, setStep] = useState(0);
  const [wizard, setWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [environment, setEnvironment] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [toolsOpened, setToolsOpened] = useState<string | null>(() =>
    (new URLSearchParams(location.search).get("section") === "ai-tools" || new URLSearchParams(location.search).get("tools") === "1")
      ? "tools"
      : null,
  );
  const dirty =
    !!draft &&
    !!snapshot &&
    (Object.keys(appearancePatch(draft, snapshot)).length > 0 ||
      Object.keys(policyPatches(draft, snapshot)).length > 0 ||
      profilePatch(draft, snapshot) !== null);
  useEffect(() => {
    context.onDirtyChange?.(wizard && dirty);
    return () => context.onDirtyChange?.(false);
  }, [context, wizard, dirty]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (wizard && dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [wizard, dirty]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    setSnapshot(null);
    try {
      const [settingsResult, knowledge, onboarding] = await Promise.all([
        requestSettings(plugin.restUrl!, plugin.nonce!).then(
          (value) => ({ value, error: "" }),
          (failure: unknown) => ({
            value: null,
            error:
              failure instanceof Error
                ? failure.message
                : "Assistant settings unavailable.",
          }),
        ),
        fetchKnowledgeSyncStatus(),
        requestOnboarding(plugin.restUrl!, plugin.nonce!),
      ]);
      let profile: WizardSnapshot["profile"] = null;
      let reason =
        settingsResult.error
          ? "Assistant settings are not available. Recheck the site connection, then retry."
          : "An answering backend is needed for visitor replies. Content selection is available now.";
      if (getStoreSelect(store).getConfig()?.subscriptionType) {
        try {
          const backend = await resolveBackend("ai.conversation-profile.admin");
          if (backend.available) {
            profile = await getConversationProfile();
            reason = profile
              ? "Assistant behavior uses your configured backend. Saved settings do not verify answer quality."
              : "Assistant behavior and knowledge synchronization require the premium plugin build.";
          } else reason = "Backend access is not available. Follow the Backend access guidance above, then retry.";
        } catch {
          reason = "Backend access is not available. Follow the Backend access guidance above, then retry.";
        }
      }
      const next = { settings: settingsResult.value, knowledge, profile };
      setSnapshot(next);
      setDraft(createDraft(next));
      setEnvironment(reason);
      setStep(0);
      const openRequestedSetup = setupRequested.current;
      setWizard(
        openRequestedSetup || (!onboarding.completed && !next.settings?.values.enableChatbot &&
          !next.profile?.configured &&
          !Object.values(knowledge.policies).some(
            (policy) => policy.enabled && policy.reviewPolicy !== "disabled",
          )),
      );
      if (openRequestedSetup) {
        const url = new URL(window.location.href);
        url.searchParams.delete("setup");
        window.history.replaceState(window.history.state, "", url);
        setupRequested.current = false;
      }
      setCompleted([]);
      setConfirmRemoval(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Setup could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [plugin.restUrl, plugin.nonce, store]);
  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) void load();
    });
    return () => {
      canceled = true;
    };
  }, [load]);
  useEffect(() => {
    const refreshSummary = () => { if (!wizard && !saving) void load(); };
    window.addEventListener("wpsuite-product-summary-open", refreshSummary);
    return () => window.removeEventListener("wpsuite-product-summary-open", refreshSummary);
  }, [load, wizard, saving]);
  const help = (label: string, id: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" }}>
      <span>{label}</span>
      <Button
        variant="subtle"
        size="compact-xs"
        aria-label={`Help: ${label}`}
        onClick={() => context.openHelp(id)}
      >
        <IconInfoCircle size={15} />
      </Button>
    </span>
  );
  if (loading) return <Text role="status">Loading Answers setup…</Text>;
  if (!snapshot || !draft)
    return (
      <Alert color="red">
        {error}
        <Button onClick={() => void load()}>Retry loading setup</Button>
      </Alert>
    );
  const patchAppearance = (value: Partial<AnswersDraft["appearance"]>) =>
    setDraft({ ...draft, appearance: { ...draft.appearance, ...value } });
  const removed = Object.entries(policyPatches(draft, snapshot))
    .filter(([, policy]) => !policy.enabled)
    .map(([type]) => type);
  const behaviorRequired = draft.appearance.enableChatbot && !!snapshot.profile;
  const behaviorValid =
    !behaviorRequired ||
    (!!draft.role.trim() &&
      !!draft.purpose.trim() &&
      !!draft.tone.trim() &&
      draft.task.split("\n").filter((line) => line.trim()).length <= 50 &&
      draft.task.split("\n").every((line) => line.trim().length <= 500));
  const appearanceValid =
    draft.appearance.title.length <= 120 &&
    (!draft.appearance.brandColor ||
      /^#[0-9a-f]{6}$/i.test(draft.appearance.brandColor));
  const nextStep = () =>
    setStep(
      step === 0 && !draft.appearance.enableChatbot
        ? 3
        : step === 1 && !snapshot.profile
        ? 3
        : Math.min(step + 1, 4),
    );
  const previousStep = () =>
    setStep(
      step === 3
        ? draft.appearance.enableChatbot
          ? snapshot.profile
            ? 2
            : 1
          : 0
        : Math.max(0, step - 1),
    );
  const finish = async () => {
    if (
      !behaviorValid ||
      !appearanceValid ||
      (removed.length > 0 && !confirmRemoval)
    )
      return;
    setSaving(true);
    setError("");
    setMessage("");
    let savedAny = false;
    try {
      const next = await saveWizard(
        draft,
        snapshot,
        {
          readKnowledge: fetchKnowledgeSyncStatus,
          savePolicy: updateKnowledgeSyncPolicy,
          saveProfile: updateConversationProfile,
          saveAppearance: (revision, values) =>
            requestSettings(plugin.restUrl!, plugin.nonce!, {
              revision,
              values,
            }),
        },
        (next, label) => {
          savedAny = true;
          setSnapshot(next);
          setCompleted((current) => [...current, label]);
          window.dispatchEvent(new Event("wpsuite-product-saved"));
        },
      );
      await requestOnboarding(plugin.restUrl!, plugin.nonce!, { completed: true });
      setSnapshot(next);
      setDraft(createDraft(next));
      setWizard(false);
      context.onDirtyChange?.(false);
      setMessage(
        "Setup saved. Content synchronization follows your source policies; ingestion and visitor replies depend on the configured backend.",
      );
      if (next.settings?.runtime_refresh_requested) {
        try {
          await reloadConfig(store);
        } catch {
          setMessage(
            "Setup saved. Runtime refresh could not be confirmed; reload this page before checking the assistant.",
          );
        }
      }
      window.dispatchEvent(new Event("wpsuite-product-saved"));
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : "Save failed."} ${
          savedAny || completed.length
            ? "Some changes were saved (listed below). Retry saves only the remaining changes."
            : "Your edits are retained."
        }`,
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Stack gap="md" className={classes.answersSurface}>
      {message && <Alert color="green">{message}</Alert>}
      {error && (
        <Alert color="red" role="alert">
          {error}
          <Button
            variant="subtle"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Reload setup and discard unsaved edits? Already saved changes will be kept.",
                )
              )
                void load();
            }}
          >
            Reload saved settings
          </Button>
        </Alert>
      )}
      {wizard ? (
        <Card withBorder padding="md">
          <Stack>
            <Group justify="space-between">
              <Title order={3}>Set up Answers</Title>
              <Badge>
                {steps[step]} · {step + 1} / 5
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Changes are saved only when you finish. Existing detailed settings
              are preserved.
            </Text>
            {step === 0 && (
              <>
                <Accordion variant="contained">
                  <Accordion.Item value="intro">
                    <Accordion.Control>What can Answers do?</Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="sm">
                        <Text size="sm">Answers brings together a site-wide chatbot and DocSearch, an embeddable semantic search component. Both use the same knowledge base.</Text>
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                          <Card withBorder padding="sm">
                            <Text fw={600}>A chatbot across your site</Text>
                            <Text size="sm">Choose its name, appearance and behavior here, then select the WordPress content it can use. The floating button gives visitors a conversation wherever they are.</Text>
                          </Card>
                          <Card withBorder padding="sm">
                            <Text fw={600}>Search where visitors need it</Text>
                            <Text size="sm">Add AI-Kit Doc Search in Gutenberg, the Doc Search (PRO) widget in Elementor, or [smartcloud-ai-kit-doc-search] to a header or page. No floating chatbot is required.</Text>
                          </Card>
                        </SimpleGrid>
                        <Text size="sm"><strong>Start without a subscription:</strong> choose your knowledge content and explore the editor and image-metadata tools below. On-device AI depends on browser support. Visitor answers and search need the existing Pro runtime and a compatible backend.</Text>
                        <Text size="sm">This setup saves only when you finish. Existing detailed settings are preserved, and you can run it again with your saved values.</Text>
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
                <Switch
                  label="Show the assistant across this site"
                  description="Add a floating chatbot visitors can open from any page."
                  checked={draft.appearance.enableChatbot}
                  disabled={!snapshot.settings?.connected}
                  onChange={(event) =>
                    patchAppearance({
                      enableChatbot: event.currentTarget.checked,
                    })
                  }
                  styles={{
                    input: { appearance: "none", WebkitAppearance: "none" },
                  }}
                />
                {!snapshot.settings?.connected && (
                  <Text size="sm">
                    Connect this site to WP Suite to save assistant appearance.
                    You can choose knowledge content now.
                  </Text>
                )}
                <Text size="sm">
                  Leave the assistant off to go straight to knowledge content.
                  You can enable it later.
                </Text>
                <Text size="sm" c="dimmed">
                  {environment}
                </Text>
              </>
            )}
            {step === 1 && (
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label={help("Assistant name", "answers-appearance")}
                  aria-label="Assistant name"
                  maxLength={120}
                  value={draft.appearance.title}
                  onChange={(event) =>
                    patchAppearance({ title: event.currentTarget.value })
                  }
                  description="Shown in the chat header and used by the conversation profile."
                />
                <Select
                  label="Button position"
                  description="Choose the corner where visitors open the chatbot."
                  data={[
                    "bottom-right",
                    "bottom-left",
                    "top-right",
                    "top-left",
                  ].map((value) => ({ value, label: value.replace("-", " ") }))}
                  value={draft.appearance.openButtonPosition || "bottom-right"}
                  onChange={(value) =>
                    patchAppearance({
                      openButtonPosition: value || "bottom-right",
                    })
                  }
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: false }}
                />
                <ColorInput
                  label="Brand color"
                  description="Use your brand color, or keep the existing chat theme."
                  format="hex"
                  popoverProps={{
                    withinPortal: false,
                    closeOnEscape: true,
                    closeOnClickOutside: true,
                  }}
                  value={draft.appearance.brandColor || ""}
                  placeholder="Keep existing theme"
                  onChange={(value) => patchAppearance({ brandColor: value })}
                />
                <TextInput
                  label="Welcome message"
                  description="The greeting visitors see when they open the chatbot."
                  value={draft.appearance.greeting}
                  maxLength={4000}
                  onChange={(event) =>
                    patchAppearance({ greeting: event.currentTarget.value })
                  }
                />
                <TextInput
                  label="Question placeholder"
                  description="A short hint in the question field before visitors type."
                  value={draft.appearance.placeholder}
                  maxLength={500}
                  onChange={(event) =>
                    patchAppearance({ placeholder: event.currentTarget.value })
                  }
                />
              </SimpleGrid>
            )}
            {step === 2 && (
              <>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Textarea
                    autosize minRows={2} maxRows={5}
                    label={help("Assistant role", "answers-profile")}
                    aria-label="Assistant role"
                    description="Describe who the assistant is and the expertise it offers."
                    required
                    value={draft.role}
                    maxLength={2000}
                    onChange={(event) =>
                      setDraft({ ...draft, role: event.currentTarget.value })
                    }
                  />
                  <Textarea
                    autosize minRows={2} maxRows={5}
                    label="Site purpose"
                  description="Describe what this site helps visitors do."
                    required
                    value={draft.purpose}
                    maxLength={4000}
                    onChange={(event) =>
                      setDraft({ ...draft, purpose: event.currentTarget.value })
                    }
                  />
                  <Textarea
                    autosize minRows={3} maxRows={8}
                    label="Main tasks"
                    description="List the main things the assistant should help with, one per line."
                    value={draft.task}
                    onChange={(event) =>
                      setDraft({ ...draft, task: event.currentTarget.value })
                    }
                  />
                  <Textarea
                    autosize minRows={3} maxRows={8}
                    label="Tone"
                  description="Describe how the assistant should sound, for example friendly and concise."
                    required
                    maxLength={500}
                    value={draft.tone}
                    onChange={(event) =>
                      setDraft({ ...draft, tone: event.currentTarget.value })
                    }
                  />
                </SimpleGrid>
                <Textarea
                  label="General context"
                  description="Facts and guidance for this assistant; do not include secrets."
                  autosize minRows={4} maxRows={12}
                  maxLength={50000}
                  value={draft.context}
                  onChange={(event) =>
                    setDraft({ ...draft, context: event.currentTarget.value })
                  }
                />
                {!snapshot.profile?.configured && (
                  <Text size="sm">
                    Knowledge base search will be enabled for this new profile.
                    Other tools and detailed behavior remain at their backend
                    defaults.
                  </Text>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <MultiSelect
                  label={help("Knowledge content", "answers-knowledge")}
                  aria-label="Knowledge content"
                  description="Choose public content types. Public taxonomies are included automatically when enabling a type with no taxonomy selection."
                  data={snapshot.knowledge.availablePostTypes.map((type) => ({
                    value: type.value,
                    label: type.label,
                  }))}
                  value={draft.selected}
                  onChange={(selected) => {
                    setDraft({ ...draft, selected });
                    setConfirmRemoval(false);
                  }}
                  searchable
                  comboboxProps={{ withinPortal: false }}
                />
                <Text size="sm">
                  Only published, publicly viewable content is eligible.
                  Existing manual review and document settings are preserved.
                  Choosing content does not configure backend transport or prove
                  ingestion is ready.
                </Text>
                {!snapshot.profile && (
                  <Text size="sm" c="dimmed">
                    {environment}
                  </Text>
                )}
              </>
            )}
            {step === 4 && (
              <>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <div>
                    <Text fw={600}>Assistant</Text>
                    <Text>
                      {draft.appearance.enableChatbot ? "Enabled" : "Off"}
                      {draft.appearance.title
                        ? ` · ${draft.appearance.title}`
                        : ""}
                    </Text>
                    <Text size="sm">
                      {draft.appearance.openButtonPosition || "bottom-right"}
                    </Text>
                  </div>
                  <div>
                    <Text fw={600}>Knowledge content</Text>
                    <Text>
                      {draft.selected
                        .map(
                          (type) =>
                            snapshot.knowledge.availablePostTypes.find(
                              (item) => item.value === type,
                            )?.label || type,
                        )
                        .join(", ") || "No content types selected"}
                    </Text>
                  </div>
                </SimpleGrid>
                {behaviorRequired && (
                  <Text size="sm">
                    {draft.role} · {draft.purpose} · {draft.tone}
                  </Text>
                )}
                {!snapshot.profile && draft.appearance.enableChatbot && (
                  <Alert color="yellow">
                    The assistant can be enabled, but no compatible behavior
                    backend is available. Visitor replies are not ready until a
                    backend and Pro runtime are configured.
                  </Alert>
                )}
                {removed.length > 0 && (
                  <Alert color="yellow">
                    <Text>
                      Disabling these sources queues removal of their ingested
                      knowledge: {removed.join(", ")}. WordPress content is
                      kept.
                    </Text>
                    <Checkbox
                      label="I understand the knowledge removal"
                      checked={confirmRemoval}
                      onChange={(event) =>
                        setConfirmRemoval(event.currentTarget.checked)
                      }
                    />
                  </Alert>
                )}
                {!behaviorValid && (
                  <Alert color="red">
                    Provide the assistant role, site purpose and tone. Main
                    tasks allow at most 50 lines of 500 characters each.
                  </Alert>
                )}
                {completed.length > 0 && (
                  <Stack gap={2}>
                    <Text fw={600}>Saved changes</Text>
                    {completed.map((label, index) => (
                      <Text key={`${label}-${index}`} size="sm">
                        {label}
                      </Text>
                    ))}
                  </Stack>
                )}
              </>
            )}
            <Group>
              {step > 0 && (
                <Button
                  variant="default"
                  disabled={saving}
                  onClick={previousStep}
                >
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button
                  disabled={
                    (step === 1 && !appearanceValid) ||
                    (step === 2 && !behaviorValid)
                  }
                  onClick={nextStep}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  loading={saving}
                  disabled={
                    !behaviorValid ||
                    !appearanceValid ||
                    (removed.length > 0 && !confirmRemoval)
                  }
                  onClick={() => void finish()}
                >
                  {completed.length
                    ? "Retry remaining changes"
                    : "Finish setup"}
                </Button>
              )}
              <Button
                variant="subtle"
                disabled={saving}
                onClick={() => {
                  setDraft(createDraft(snapshot));
                  setWizard(false);
                  setError("");
                  context.onDirtyChange?.(false);
                }}
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        <Card withBorder padding="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={3}>Answers setup</Title>
              <Button
                variant="default"
                onClick={() => {
                  setDraft(createDraft(snapshot));
                  setStep(0);
                  setCompleted([]);
                  setConfirmRemoval(false);
                  setWizard(true);
                }}
              >
                Run setup again
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <div>
                <Text c="dimmed" size="sm">
                  Site-wide assistant
                </Text>
                <Text>
                  {snapshot.settings?.values.enableChatbot ? "Enabled" : "Off"}
                </Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">
                  Content types
                </Text>
                <Text>{createDraft(snapshot).selected.length}</Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">
                  Assistant behavior
                </Text>
                <Text>
                  {snapshot.profile === null
                    ? "Not available"
                    : snapshot.profile.configured ? "Configured" : "Not configured"}
                </Text>
              </div>
            </SimpleGrid>
            <Text size="sm" c="dimmed">
              {environment}
            </Text>
            <Text size="sm">
              For an embedded search, add the <strong>AI-Kit Doc Search</strong>{" "}
              block in Gutenberg, the Doc Search (PRO) widget in Elementor, or
              the [smartcloud-ai-kit-doc-search] shortcode. It uses the same
              knowledge base as the floating assistant.
            </Text>
          </Stack>
        </Card>
      )}
      <Accordion
        variant="contained"
        value={toolsOpened}
        onChange={setToolsOpened}
      >
        <Accordion.Item value="tools">
          <Accordion.Control>AI Tools · More from AI-Kit</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              {[
                {
                  title: "Writing in Gutenberg",
                  text: "Select text and open AI-Kit in the block toolbar to rewrite, proofread or translate. Use the AI-Kit sidebar to generate content and post metadata.",
                  help: "ai-tools-editor",
                },
                {
                  title: "Image metadata",
                  text: "In the Media Library, open an attachment to prepare image metadata, or use the AI-Kit bulk action for selected images.",
                  help: "ai-tools-media",
                },
                {
                  title: "Visitor AI actions",
                  text: "Add the AI-Kit Feature (PRO) block in Gutenberg for writing, rewriting, proofreading, summarizing or translation. Elementor offers the AI Feature (PRO) widget; the shortcode is [smartcloud-ai-kit-feature]. Visitor actions need the existing Pro runtime and backend.",
                  help: "ai-tools-frontend",
                },
              ].map((tool) => (
                <Card key={tool.title} withBorder padding="sm">
                  <Stack gap="xs">
                    <Text fw={600}>{tool.title}</Text>
                    <Text size="sm">{tool.text}</Text>
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      onClick={() => context.openHelp(tool.help)}
                    >
                      How to use it
                    </Button>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
            <Text size="sm" c="dimmed" mt="sm">
              Editor and media AI availability depends on browser support or the
              configured provider. No content is created automatically.
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

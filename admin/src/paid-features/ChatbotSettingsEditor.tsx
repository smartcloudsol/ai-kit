import {
  ActionIcon,
  Button,
  Card,
  ColorInput,
  DEFAULT_THEME,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  CustomTranslations,
  getStoreDispatch,
  getStoreSelect,
  LANGUAGE_OPTIONS,
  TEXT_DOMAIN,
  type AiChatbotLabels,
  type AiChatbotProps,
  type AiKitConfig,
  type Store,
} from "@smart-cloud/ai-kit-core";
import {
  IconAlertCircle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useSelect } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";

import { I18n } from "aws-amplify/utils";
import { type SettingsEditorProps } from "../main";
import classes from "../main.module.css";
import { saveSettings } from "./utils";

const DEFAULT_CHATBOT_LABELS: Required<AiChatbotLabels> = {
  modalTitle: "AI Assistant",
  userLabel: "User",
  assistantLabel: "Assistant",
  assistantThinkingLabel: "Assistant is thinking...",
  askMeLabel: "Ask me",
  sendLabel: "Send",
  cancelLabel: "Cancel",
  resetLabel: "Reset",
  confirmLabel: "Confirm",
  clickAgainToConfirmLabel: "Click again to confirm",
  notSentLabel: "Not sent",
  editLabel: "Edit",
  readyLabel: "Ready.",
  readyEmptyLabel: "I'm ready to assist you.",
  addLabel: "Add",
  addImageLabel: "Add image",
  removeImageLabel: "Remove image",
  closeChatLabel: "Close chat",
  maximizeLabel: "Maximize",
  restoreSizeLabel: "Restore size",
  referencesLabel: "References",
  referenceLabel: "Reference",
  acceptResponseLabel: "Accept response",
  rejectResponseLabel: "Reject response",
  placeholder: "Ask anything…",
  emptyResponseLabel: "Empty response",
  unexpectedErrorLabel: "Unexpected error",
};

type PreviewChatbotProps = AiChatbotProps & {
  store: Store;
  previewMode: true;
  onClose: () => void;
};

type Props = SettingsEditorProps & {
  store: Store;
};

type ChatbotConfigValues = Partial<AiChatbotProps> & {
  maxTokens?: number;
};

type FormValues = {
  enableChatbot: boolean;
  chatbot: ChatbotConfigValues;
  labels: AiChatbotLabels;
};

const LABEL_KEYS: Array<keyof AiChatbotLabels> = [
  "userLabel",
  "assistantLabel",
  "assistantThinkingLabel",
  "sendLabel",
  "cancelLabel",
  "resetLabel",
  "confirmLabel",
  "clickAgainToConfirmLabel",
  "notSentLabel",
  "editLabel",
  "readyLabel",
  "readyEmptyLabel",
  "addLabel",
  "addImageLabel",
  "removeImageLabel",
  "closeChatLabel",
  "maximizeLabel",
  "restoreSizeLabel",
  "referencesLabel",
  "referenceLabel",
  "acceptResponseLabel",
  "rejectResponseLabel",
  "emptyResponseLabel",
  "unexpectedErrorLabel",
];

export default function ChatbotSettingsEditor({
  apiUrl,
  config,
  accountId,
  siteId,
  siteKey,
  onSave,
  InfoLabel,
  openInfo,
  store,
}: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [PreviewChatbot, setPreviewChatbot] =
    useState<ComponentType<PreviewChatbotProps> | null>(null);
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
  const showPreview = useSelect(
    () => getStoreSelect(store).isShowChatbotPreview(),
    [store],
  );

  const customTranslations: CustomTranslations | undefined | null = useSelect(
    () => getStoreSelect(store).getCustomTranslations(),
    [store],
  );

  const form = useForm<FormValues>({
    initialValues: {
      enableChatbot: !!config?.enableChatbot,
      chatbot: (config?.chatbot ?? {}) as ChatbotConfigValues,
      labels: (config?.chatbot?.labels ?? {}) as AiChatbotLabels,
    },
  });

  useEffect(() => {
    I18n.putVocabularies(customTranslations || {});
  }, [customTranslations]);

  useEffect(() => {
    let cancelled = false;

    if (!showPreview || PreviewChatbot) {
      return;
    }

    import("@smart-cloud/ai-kit-ui")
      .then((module) => {
        if (cancelled) {
          return;
        }

        setPreviewChatbot(
          () => module.AiChatbot as ComponentType<PreviewChatbotProps>,
        );
        setPreviewLoadError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error(error);
        setPreviewLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load chatbot preview.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [PreviewChatbot, showPreview]);

  // keep in sync with config (e.g. when language changes in main.tsx)
  useEffect(() => {
    if (!config) return;
    form.setValues({
      enableChatbot: !!config.enableChatbot,
      chatbot: (config.chatbot ?? {}) as ChatbotConfigValues,
      labels: (config.chatbot?.labels ?? {}) as AiChatbotLabels,
    });
    I18n.setLanguage(config.chatbot?.language ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const previewProps = useMemo(() => {
    const merged: Partial<AiChatbotProps> = {
      ...(config?.chatbot ?? {}),
      ...(form.values.chatbot ?? {}),
      labels: form.values.labels,
      previewMode: true,
    };
    return merged;
  }, [config, form.values.chatbot, form.values.labels]);

  const handleSave = useCallback(
    async (values: FormValues) => {
      if (!accountId || !siteId || !siteKey) return;

      setIsSaving(true);
      try {
        const nextConfig: AiKitConfig = {
          ...config,
          enableChatbot: values.enableChatbot,
          chatbot: {
            ...(config.chatbot ?? {}),
            ...(values.chatbot ?? {}),
            labels: values.labels,
          } as AiChatbotProps,
        };

        const payload: Omit<AiKitConfig, "subscriptionType"> = {
          ...(nextConfig as unknown as Record<string, unknown>),
        } as Omit<AiKitConfig, "subscriptionType">;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (payload as any).subscriptionType;

        const updatedConfig = await saveSettings(
          apiUrl,
          accountId,
          siteId,
          siteKey,
          payload,
        );
        onSave(updatedConfig);

        notifications.show({
          title: __("Settings saved", TEXT_DOMAIN),
          message: __("Chatbot settings saved successfully.", TEXT_DOMAIN),
          color: "green",
          icon: <IconCheck />,
          className: classes["notification"],
        });
      } catch (error) {
        notifications.show({
          title: __("Error occured", TEXT_DOMAIN),
          message: (error as Error).message,
          color: "red",
          icon: <IconAlertCircle />,
          className: classes["notification"],
        });
      } finally {
        setIsSaving(false);
      }
    },
    [accountId, siteId, siteKey, config, apiUrl, onSave],
  );

  const labelsEntries = Object.entries(form.values.labels ?? {}).filter(
    ([, v]) => typeof v === "string",
  ) as Array<[keyof AiChatbotLabels, string]>;

  const [newKey, setNewKey] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<string>("");

  const availableKeys = LABEL_KEYS.filter(
    (k) => !(k in (form.values.labels ?? {})),
  )
    .map((k) => ({
      value: k as string,
      label: `${I18n.get(DEFAULT_CHATBOT_LABELS[k])} (${k as string})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  /* -----------------------------
   * Theme & appearance settings
   * ----------------------------- */

  const shadeOptions = Array.from({ length: 10 }, (_, i) => ({
    value: String(i),
    label: String(i),
  }));

  const colors = useMemo(() => {
    const raw = (form.values.chatbot as unknown as Record<string, unknown>)
      ?.colors;
    if (!raw || typeof raw !== "object") return {} as Record<string, string>;
    return raw as Record<string, string>;
  }, [form.values.chatbot]);

  const customColorEntries = useMemo(
    () =>
      Object.entries(colors)
        .filter(([k, v]) => typeof k === "string" && typeof v === "string")
        .sort(([a], [b]) => a.localeCompare(b)),
    [colors],
  );

  const primaryColorOptions = useMemo(() => {
    const base = Object.keys(DEFAULT_THEME.colors);
    const extra = Object.keys(colors);
    const all = [...base, ...extra].filter((v, i, arr) => arr.indexOf(v) === i);

    return all.map((value) => ({
      value,
      label: base.includes(value) ? value : `${value} (custom)`,
    }));
  }, [colors]);

  const primaryShadeValue = (
    form.values.chatbot as unknown as Record<string, unknown>
  )?.primaryShade;

  const primaryShadeObj: { light: number; dark: number } =
    typeof primaryShadeValue === "number"
      ? { light: primaryShadeValue, dark: primaryShadeValue }
      : {
          light:
            typeof (primaryShadeValue as { light?: unknown })?.light ===
            "number"
              ? ((primaryShadeValue as { light: number }).light as number)
              : 6,
          dark:
            typeof (primaryShadeValue as { dark?: unknown })?.dark === "number"
              ? ((primaryShadeValue as { dark: number }).dark as number)
              : 8,
        };

  const primaryShadeLight = primaryShadeObj.light;
  const primaryShadeDark = primaryShadeObj.dark;

  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#228be6");

  return (
    <>
      <form
        name="chatbotsettings-editor"
        onSubmit={form.onSubmit(handleSave)}
        style={{ maxWidth: 900 }}
      >
        <Stack gap="md">
          <Card withBorder shadow="sm">
            <Stack gap="md">
              <Group align="flex-start" justify="space-between">
                <div>
                  <Title order={4}>Chatbot configuration</Title>
                  <Text size="sm" c="dimmed">
                    Enable/disable the chatbot, customize UI behavior and
                    labels.
                  </Text>
                </div>

                <Switch
                  checked={showPreview}
                  onChange={(e) =>
                    getStoreDispatch(store).setShowChatbotPreview(
                      e.currentTarget.checked,
                    )
                  }
                  onLabel={<IconEye size={14} />}
                  offLabel={<IconEyeOff size={14} />}
                  label={
                    <InfoLabel
                      text="Preview"
                      scrollToId="chatbot-preview"
                      onOpen={openInfo}
                    />
                  }
                />
              </Group>

              <Switch
                label={
                  <InfoLabel
                    text="Enable chatbot"
                    scrollToId="chatbot-enable"
                    onOpen={openInfo}
                  />
                }
                checked={form.values.enableChatbot}
                onChange={(e) =>
                  form.setFieldValue("enableChatbot", e.currentTarget.checked)
                }
              />

              <Divider />

              <SimpleGrid
                cols={{ base: 1, sm: 2 }}
                spacing="md"
                verticalSpacing="md"
              >
                <TextInput
                  label={
                    <InfoLabel
                      text="Chat title"
                      scrollToId="chatbot-title"
                      onOpen={openInfo}
                    />
                  }
                  description="Title shown at the top of the chat modal."
                  placeholder={I18n.get(DEFAULT_CHATBOT_LABELS.modalTitle)}
                  value={(form.values.chatbot.title as string) ?? ""}
                  onChange={(e) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      title: e.currentTarget.value,
                    })
                  }
                />

                <TextInput
                  label={
                    <InfoLabel
                      text="Placeholder"
                      scrollToId="chatbot-placeholder"
                      onOpen={openInfo}
                    />
                  }
                  description="Input placeholder text shown above the message box."
                  placeholder={I18n.get(DEFAULT_CHATBOT_LABELS.placeholder)}
                  value={(form.values.chatbot.placeholder as string) ?? ""}
                  onChange={(e) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      placeholder: e.currentTarget.value,
                    })
                  }
                />

                <Select
                  searchable
                  clearable
                  label={
                    <InfoLabel
                      text="Language"
                      scrollToId="chatbot-language"
                      onOpen={openInfo}
                    />
                  }
                  description="UI language for the chatbot. Leave empty to use defaults."
                  data={[
                    { value: "", label: "--- Select ---" },
                    ...LANGUAGE_OPTIONS,
                  ]}
                  value={(form.values.chatbot.language as string) ?? ""}
                  onChange={(value) => {
                    I18n.setLanguage(value ?? "");
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      language: value ? (value as never) : (undefined as never),
                    });
                  }}
                />

                <Select
                  label={
                    <InfoLabel
                      text="Direction"
                      scrollToId="chatbot-direction"
                      onOpen={openInfo}
                    />
                  }
                  description='Text direction. "auto" follows the document direction.'
                  data={[
                    { value: "auto", label: "Auto" },
                    { value: "ltr", label: "LTR" },
                    { value: "rtl", label: "RTL" },
                  ]}
                  value={(form.values.chatbot.direction as string) ?? "auto"}
                  onChange={(value) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      direction: (value ?? "auto") as never,
                    })
                  }
                />

                <Select
                  label={
                    <InfoLabel
                      text="History storage"
                      scrollToId="chatbot-history-storage"
                      onOpen={openInfo}
                    />
                  }
                  description="Where to persist chat history (cleared after the retention window)."
                  data={[
                    { value: "localstorage", label: "Local storage (default)" },
                    { value: "sessionstorage", label: "Session storage" },
                    { value: "nostorage", label: "No storage" },
                  ]}
                  value={
                    (form.values.chatbot.historyStorage as string) ??
                    "localstorage"
                  }
                  onChange={(value) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      historyStorage: (value ?? "localstorage") as never,
                    })
                  }
                />

                <NumberInput
                  label={
                    <InfoLabel
                      text="History retention"
                      scrollToId="chatbot-history-retention"
                      onOpen={openInfo}
                    />
                  }
                  description="Days to keep chat history/messages locally. Default: 1."
                  placeholder="e.g. 1"
                  min={1}
                  step={1}
                  allowNegative={false}
                  allowDecimal={false}
                  value={
                    typeof form.values.chatbot?.emptyHistoryAfterDays ===
                    "number"
                      ? form.values.chatbot.emptyHistoryAfterDays
                      : undefined
                  }
                  onChange={(value) => {
                    const numericValue =
                      typeof value === "number" &&
                      Number.isFinite(value) &&
                      value >= 1
                        ? Math.trunc(value)
                        : undefined;
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      emptyHistoryAfterDays: numericValue,
                    });
                  }}
                />
              </SimpleGrid>
            </Stack>
          </Card>

          <Card withBorder shadow="sm">
            <Stack gap="md">
              <div>
                <Title order={4}>Advanced</Title>
                <Text size="sm" c="dimmed">
                  Optional layout and limits.
                </Text>
              </div>

              <SimpleGrid
                cols={{ base: 1, sm: 2 }}
                spacing="md"
                verticalSpacing="md"
              >
                <Select
                  label={
                    <InfoLabel
                      text="Open button position"
                      scrollToId="chatbot-openbutton-position"
                      onOpen={openInfo}
                    />
                  }
                  description="Where the open button is placed on the page."
                  data={[
                    { value: "bottom-right", label: "Bottom right" },
                    { value: "bottom-left", label: "Bottom left" },
                    { value: "top-right", label: "Top right" },
                    { value: "top-left", label: "Top left" },
                  ]}
                  value={
                    (form.values.chatbot.openButtonPosition as string) ??
                    "bottom-right"
                  }
                  onChange={(value) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      openButtonPosition: (value ?? "bottom-right") as never,
                    })
                  }
                />
                <TextInput
                  label={
                    <InfoLabel
                      text="Open button label"
                      scrollToId="chatbot-openbutton-label"
                      onOpen={openInfo}
                    />
                  }
                  description="Label shown on the open button."
                  value={(form.values.chatbot.openButtonTitle as string) ?? ""}
                  placeholder={I18n.get(DEFAULT_CHATBOT_LABELS.askMeLabel)}
                  onChange={(e) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      openButtonTitle: e.currentTarget.value,
                    })
                  }
                />

                <Select
                  label={
                    <InfoLabel
                      text="Open button icon layout"
                      scrollToId="chatbot-openbutton-icon-layout"
                      onOpen={openInfo}
                    />
                  }
                  description="Icon position relative to the title."
                  data={[
                    { value: "top", label: "Top" },
                    { value: "bottom", label: "Bottom" },
                    { value: "left", label: "Left" },
                    { value: "right", label: "Right" },
                  ]}
                  value={
                    (form.values.chatbot.openButtonIconLayout as string) ??
                    "top"
                  }
                  onChange={(value) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      openButtonIconLayout: (value ?? "top") as never,
                    })
                  }
                />

                <TextInput
                  label={
                    <InfoLabel
                      text="Open button icon (base64)"
                      scrollToId="chatbot-openbutton-icon"
                      onOpen={openInfo}
                    />
                  }
                  description="Data URL (e.g. data:image/svg+xml;base64,...)"
                  value={(form.values.chatbot.openButtonIcon as string) ?? ""}
                  onChange={(e) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      openButtonIcon: e.currentTarget.value,
                    })
                  }
                />
              </SimpleGrid>
              <Group mt="md" gap="xl" align="center">
                <Switch
                  label={
                    <InfoLabel
                      text="Show open button title"
                      scrollToId="chatbot-openbutton-show-title"
                      onOpen={openInfo}
                    />
                  }
                  description="Toggle the title visibility on the open button."
                  checked={
                    (form.values.chatbot.showOpenButtonTitle as
                      | boolean
                      | undefined) ?? true
                  }
                  onChange={(e) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      showOpenButtonTitle: e.currentTarget.checked as never,
                    })
                  }
                />

                <Switch
                  label={
                    <InfoLabel
                      text="Show open button icon"
                      scrollToId="chatbot-openbutton-show-icon"
                      onOpen={openInfo}
                    />
                  }
                  description="Toggle the icon visibility on the open button."
                  checked={
                    (form.values.chatbot.showOpenButtonIcon as
                      | boolean
                      | undefined) ?? true
                  }
                  onChange={(e) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      showOpenButtonIcon: e.currentTarget.checked as never,
                    })
                  }
                />
              </Group>

              <SimpleGrid
                cols={{ base: 1, sm: 2 }}
                spacing="md"
                verticalSpacing="md"
              >
                <NumberInput
                  label={
                    <InfoLabel
                      text="Max images"
                      scrollToId="chatbot-max-images"
                      onOpen={openInfo}
                    />
                  }
                  description="Maximum number of images the chatbot accepts per message."
                  placeholder="e.g. 3"
                  min={0}
                  value={
                    (form.values.chatbot?.maxImages as number) ?? undefined
                  }
                  onChange={(v) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      maxImages: typeof v === "number" ? v : undefined,
                    })
                  }
                />

                <NumberInput
                  label={
                    <InfoLabel
                      text="Max image bytes"
                      scrollToId="chatbot-max-image-bytes"
                      onOpen={openInfo}
                    />
                  }
                  description="Maximum combined size budget for uploaded images in bytes."
                  placeholder="e.g. 2000000"
                  min={0}
                  value={
                    (form.values.chatbot?.maxImageBytes as number) ?? undefined
                  }
                  onChange={(v) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      maxImageBytes: typeof v === "number" ? v : undefined,
                    })
                  }
                />
              </SimpleGrid>

              <NumberInput
                label={
                  <InfoLabel
                    text="Max output tokens"
                    scrollToId="chatbot-max-tokens"
                    onOpen={openInfo}
                  />
                }
                description="Optional backend output cap per chatbot reply. Leave empty to use the backend default."
                placeholder="e.g. 2048"
                min={1}
                max={4096}
                step={128}
                allowNegative={false}
                allowDecimal={false}
                value={
                  typeof form.values.chatbot?.maxTokens === "number"
                    ? form.values.chatbot.maxTokens
                    : undefined
                }
                onChange={(v) =>
                  form.setFieldValue("chatbot", {
                    ...form.values.chatbot,
                    maxTokens:
                      typeof v === "number" && Number.isFinite(v) && v >= 1
                        ? Math.trunc(v)
                        : undefined,
                  })
                }
              />
            </Stack>
          </Card>

          <Card withBorder shadow="sm">
            <Stack gap="md">
              <div>
                <Title order={4}>
                  <InfoLabel
                    text="Label overrides"
                    scrollToId="chatbot-label-overrides"
                    onOpen={openInfo}
                  />
                </Title>
                <Text size="sm" c="dimmed">
                  Only the overridden labels are stored. Remove an override to
                  fall back to defaults.
                </Text>
              </div>

              {labelsEntries.length === 0 && (
                <Text size="sm" c="dimmed">
                  No overrides yet.
                </Text>
              )}

              {labelsEntries.map(([k, v]) => (
                <Group key={k as string} align="flex-end">
                  <TextInput
                    label={`${I18n.get(DEFAULT_CHATBOT_LABELS[k])} (${
                      k as string
                    })`}
                    value={v}
                    placeholder={I18n.get(
                      DEFAULT_CHATBOT_LABELS[k as keyof AiChatbotLabels],
                    )}
                    onChange={(e) => {
                      form.setFieldValue("labels", {
                        ...(form.values.labels ?? {}),
                        [k]: e.target.value,
                      });
                    }}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => {
                      const next = { ...(form.values.labels ?? {}) };
                      delete (next as never)[k];
                      form.setFieldValue("labels", next);
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}

              <Divider />

              <Group align="flex-end">
                <Select
                  label="Add label"
                  data={availableKeys}
                  value={newKey}
                  onChange={setNewKey}
                  placeholder="Select key"
                  style={{ flex: 1 }}
                />
                <TextInput
                  label="Text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={I18n.get(
                    DEFAULT_CHATBOT_LABELS[newKey as keyof AiChatbotLabels],
                  )}
                  style={{ flex: 2 }}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => {
                    if (!newKey) return;
                    form.setFieldValue("labels", {
                      ...(form.values.labels ?? {}),
                      [newKey]: newValue,
                    });
                    setNewKey(null);
                    setNewValue("");
                  }}
                >
                  Add
                </Button>
              </Group>
            </Stack>
          </Card>

          <Card withBorder shadow="sm">
            <Stack gap="md">
              <div>
                <Title order={4}>Theme</Title>
                <Text size="sm" c="dimmed">
                  Customize Mantine theme settings used by the chatbot.
                </Text>
              </div>

              <SimpleGrid
                cols={{ base: 1, sm: 2 }}
                spacing="md"
                verticalSpacing="md"
              >
                <Select
                  label={
                    <InfoLabel
                      text="Color mode"
                      scrollToId="chatbot-color-mode"
                      onOpen={openInfo}
                    />
                  }
                  description='Theme mode. "auto" follows the site.'
                  data={[
                    { value: "auto", label: "Auto" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                  value={(form.values.chatbot.colorMode as string) ?? "auto"}
                  onChange={(value) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      colorMode: (value ?? "auto") as never,
                    })
                  }
                />

                <Select
                  searchable
                  clearable
                  label={
                    <InfoLabel
                      text="Primary color"
                      scrollToId="chatbot-primary-color"
                      onOpen={openInfo}
                    />
                  }
                  placeholder="Select theme color"
                  description="Primary color used in the chatbot UI."
                  data={primaryColorOptions}
                  value={(form.values.chatbot?.primaryColor as string) ?? null}
                  onChange={(value) =>
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      ...(value
                        ? { primaryColor: value }
                        : { primaryColor: undefined }),
                    })
                  }
                />

                <Group grow align="flex-start">
                  <Select
                    label={
                      <InfoLabel
                        text="Primary shade (light)"
                        scrollToId="chatbot-primary-shade-light"
                        onOpen={openInfo}
                      />
                    }
                    data={shadeOptions}
                    value={String(primaryShadeLight)}
                    description="Shade used in light mode."
                    onChange={(v) => {
                      const next = Number.parseInt(v ?? "6", 10);
                      form.setFieldValue("chatbot", {
                        ...form.values.chatbot,
                        primaryShade: {
                          light: (Number.isFinite(next) ? next : 6) as never,
                          dark: primaryShadeDark as never,
                        },
                      });
                    }}
                  />
                  <Select
                    label={
                      <InfoLabel
                        text="Primary shade (dark)"
                        scrollToId="chatbot-primary-shade-dark"
                        onOpen={openInfo}
                      />
                    }
                    data={shadeOptions}
                    value={String(primaryShadeDark)}
                    description="Shade used in dark mode."
                    onChange={(v) => {
                      const next = Number.parseInt(v ?? "8", 10);
                      form.setFieldValue("chatbot", {
                        ...form.values.chatbot,
                        primaryShade: {
                          light: primaryShadeLight as never,
                          dark: Number.isFinite(next)
                            ? (next as never)
                            : (8 as never),
                        },
                      });
                    }}
                  />
                </Group>
              </SimpleGrid>

              <Textarea
                label={
                  <InfoLabel
                    text="Theme Overrides"
                    scrollToId="chatbot-theme-overrides"
                    onOpen={openInfo}
                  />
                }
                description="Optional scoped CSS for the chatbot root (great for overriding design tokens)."
                placeholder=":host, #ai-kit-inline-root, #ai-kit-portal-root { --ai-kit-chat-border-radius: 8px; }"
                minRows={4}
                value={(form.values.chatbot?.themeOverrides as string) ?? ""}
                resize="vertical"
                onChange={(event) =>
                  form.setFieldValue("chatbot", {
                    ...form.values.chatbot,
                    themeOverrides: event.currentTarget.value,
                  })
                }
              />

              <Divider />

              <div>
                <Title order={5}>
                  <InfoLabel
                    text="Custom colors"
                    scrollToId="chatbot-custom-colors"
                    onOpen={openInfo}
                  />
                </Title>
                <Text size="sm" c="dimmed">
                  Add named colors (hex) that can also be selected as the
                  primary color.
                </Text>
              </div>

              {customColorEntries.length === 0 && (
                <Text size="sm" c="dimmed">
                  No custom colors yet.
                </Text>
              )}

              {customColorEntries.map(([name, value]) => (
                <Group key={name} align="flex-end">
                  <TextInput
                    label="Name"
                    defaultValue={name}
                    onBlur={(e) => {
                      const nextName = e.currentTarget.value.trim();
                      if (!nextName || nextName === name) return;
                      // prevent overwriting another color
                      if (nextName in colors) {
                        e.currentTarget.value = name;
                        return;
                      }
                      const next = { ...colors };
                      const currentValue = next[name];
                      delete next[name];
                      next[nextName] = currentValue;
                      form.setFieldValue("chatbot", {
                        ...form.values.chatbot,
                        colors: Object.keys(next).length ? next : undefined,
                      } as never);
                    }}
                    style={{ flex: 1 }}
                  />
                  <ColorInput
                    label="Hex"
                    format="hex"
                    value={value}
                    onChange={(hex) => {
                      form.setFieldValue("chatbot", {
                        ...form.values.chatbot,
                        colors: {
                          ...colors,
                          [name]: hex,
                        },
                      } as never);
                    }}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => {
                      const next = { ...colors };
                      delete next[name];
                      form.setFieldValue("chatbot", {
                        ...form.values.chatbot,
                        colors: Object.keys(next).length ? next : undefined,
                      } as never);
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}

              <Divider />

              <Group align="flex-end">
                <TextInput
                  label="New color name"
                  placeholder="e.g. brand"
                  value={newColorName}
                  description="Unique name for the color."
                  onChange={(e) => setNewColorName(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <ColorInput
                  label="Hex"
                  format="hex"
                  value={newColorHex}
                  description="Color value in hex format."
                  onChange={setNewColorHex}
                  style={{ flex: 1 }}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => {
                    const name = newColorName.trim();
                    if (!name) return;
                    if (name in colors) return;
                    form.setFieldValue("chatbot", {
                      ...form.values.chatbot,
                      colors: {
                        ...colors,
                        [name]: newColorHex,
                      },
                    } as never);
                    setNewColorName("");
                  }}
                >
                  Add
                </Button>
              </Group>
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button
              loading={isSaving}
              variant="gradient"
              type="submit"
              leftSection={<IconCheck />}
            >
              Save Chatbot Settings
            </Button>
          </Group>
        </Stack>
      </form>
      {showPreview ? (
        <div style={{ zIndex: 100000 }}>
          {PreviewChatbot ? (
            <PreviewChatbot
              {...previewProps}
              store={store}
              previewMode={true}
              onClose={() => void 0}
            />
          ) : previewLoadError ? (
            <Card withBorder shadow="sm" mt="md">
              <Text c="red" size="sm">
                {previewLoadError}
              </Text>
            </Card>
          ) : (
            <Card withBorder shadow="sm" mt="md">
              <Text size="sm" c="dimmed">
                Loading chatbot preview...
              </Text>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}

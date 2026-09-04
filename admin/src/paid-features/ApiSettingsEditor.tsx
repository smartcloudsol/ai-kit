import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconInfoCircle,
  IconMoneybagHeart,
} from "@tabler/icons-react";
import { __ } from "@wordpress/i18n";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { TEXT_DOMAIN, type AiKitConfig } from "@smart-cloud/ai-kit-core";
import { getGateyPlugin } from "@smart-cloud/gatey-core";

import { type SettingsEditorProps } from "../main";
import { mirrorKnowledgeSyncBackendBaseUrl } from "./kb-admin/api-client";
import { resolveGateyApiEndpoint } from "./kb-admin/backend-client";
import { saveSettings } from "./utils";

import classes from "../main.module.css";

type BackendTransport = "gatey" | "fetch";
type Mode = "local-only" | "backend-fallback" | "backend-only";

const ApiSettingsSchema = z
  .object({
    mode: z
      .enum(["local-only", "backend-fallback", "backend-only"])
      .default("local-only"),
    backendTransport: z.enum(["gatey", "fetch"]).optional(),
    backendApiName: z.string().optional(),
    backendBaseUrl: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "local-only") {
      return;
    }

    if (!v.backendTransport) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backendTransport"],
        message: "Required",
      });
      return;
    }

    if (v.backendTransport === "gatey" && !v.backendApiName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backendApiName"],
        message: "Required",
      });
    }

    if (v.backendTransport === "fetch" && !v.backendBaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backendBaseUrl"],
        message: "Required",
      });
    }
  });

type ApiSettingsForm = z.infer<typeof ApiSettingsSchema>;

export default function ApiSettingsEditor({
  apiUrl,
  config,
  accountId,
  siteId,
  siteKey,
  onSave,
  InfoLabel,
  openInfo,
}: SettingsEditorProps) {
  const [isSaving, setIsSaving] = useState(false);

  const gatey = useMemo(() => getGateyPlugin(), []);

  const amplifyRestApiNames = useMemo(() => {
    try {
      const rest = gatey?.cognito?.getAmplifyConfig?.()?.API?.REST ?? {};
      return Object.keys(rest);
    } catch {
      return [] as string[];
    }
  }, [gatey]);

  const form = useForm<ApiSettingsForm>({
    initialValues: {
      mode: (config?.mode as Mode) ?? "local-only",
      backendTransport: config?.backendTransport as BackendTransport,
      backendApiName: config?.backendApiName,
      backendBaseUrl: config?.backendBaseUrl,
    },
    validate: zod4Resolver(ApiSettingsSchema as never),
  });

  // keep form in sync if config changes
  useEffect(() => {
    if (!config) return;
    form.setValues({
      mode: (config.mode as Mode) ?? "local-only",
      backendTransport: config.backendTransport as BackendTransport,
      backendApiName: config.backendApiName,
      backendBaseUrl: config.backendBaseUrl,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const handleTransportChange = useCallback(
    (value: string | null) => {
      const transport = (value ?? undefined) as BackendTransport | undefined;
      form.setFieldValue("backendTransport", transport);

      if (transport === "gatey") {
        form.setFieldValue("backendBaseUrl", "");
      }
      if (transport === "fetch") {
        form.setFieldValue("backendApiName", "");
      }
    },
    [form],
  );

  const handleSave = useCallback(
    async (values: ApiSettingsForm) => {
      if (!accountId || !siteId || !siteKey) {
        console.error("Missing account ID or site ID or site key");
        return;
      }
      setIsSaving(true);
      try {
        const nextConfig: AiKitConfig = {
          ...config,
          mode: values.mode,
          backendTransport:
            values.mode === "local-only" ? undefined : values.backendTransport,
          backendApiName:
            values.mode === "local-only" || values.backendTransport !== "gatey"
              ? undefined
              : values.backendApiName,
          backendBaseUrl:
            values.mode === "local-only" || values.backendTransport !== "fetch"
              ? undefined
              : values.backendBaseUrl,
        };

        // backend doesn't accept subscriptionType in settings payload
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

        try {
          const resolvedBackendBaseUrl =
            updatedConfig.mode === "local-only"
              ? ""
              : updatedConfig.backendTransport === "gatey" &&
                  updatedConfig.backendApiName
                ? (await resolveGateyApiEndpoint(
                    updatedConfig.backendApiName,
                  )) ?? ""
                : (updatedConfig.backendBaseUrl ?? "").trim().replace(/\/+$/, "");
          await mirrorKnowledgeSyncBackendBaseUrl(resolvedBackendBaseUrl);
        } catch (error) {
          notifications.show({
            title: __("Knowledge Sync runner needs attention", TEXT_DOMAIN),
            message: __(
              "API settings were saved, but the resolved backend endpoint could not be mirrored for WordPress cron. Open Knowledge Base to retry.",
              TEXT_DOMAIN,
            ),
            color: "yellow",
            icon: <IconAlertCircle />,
            className: classes["notification"],
          });
          console.error(
            "Error mirroring the Knowledge Sync backend endpoint:",
            error,
          );
        }

        notifications.show({
          title: __("Settings saved", TEXT_DOMAIN),
          message: __("API settings saved successfully.", TEXT_DOMAIN),
          color: "green",
          icon: <IconMoneybagHeart />,
          className: classes["notification"],
        });
      } catch (error) {
        console.error("Error saving API settings:", error);
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

  const transport = form.values.backendTransport;
  const backendConfigEnabled = form.values.mode !== "local-only";

  return (
    <form
      name="apisettings-editor"
      onSubmit={form.onSubmit(handleSave)}
      style={{ maxWidth: 900 }}
    >
      <Stack gap="md">
        <Card withBorder shadow="sm">
          <Stack gap="md">
            <Group align="flex-start" justify="space-between">
              <div>
                <Title order={4}>AI-Kit API configuration</Title>
                <Text size="sm" c="dimmed">
                  Configure how AI-Kit should reach backend endpoints when
                  needed.
                </Text>
              </div>
            </Group>

            <Group grow align="flex-start">
              <Select
                classNames={{ label: classes["form-field-label"] }}
                label={
                  <InfoLabel
                    text="Mode"
                    scrollToId="aikit-api-mode"
                    onOpen={openInfo}
                  />
                }
                withAsterisk
                data={[
                  { value: "local-only", label: "On-device only" },
                  {
                    value: "backend-fallback",
                    label: "On-device + backend fallback",
                  },
                  { value: "backend-only", label: "Backend only" },
                ]}
                key={form.key("mode")}
                {...form.getInputProps("mode")}
              />

              <Select
                classNames={{ label: classes["form-field-label"] }}
                label={
                  <InfoLabel
                    text="Backend connection"
                    scrollToId="aikit-api-backend-transport"
                    onOpen={openInfo}
                  />
                }
                withAsterisk={backendConfigEnabled}
                disabled={!backendConfigEnabled}
                data={[
                  {
                    value: "gatey",
                    label: "Gatey (via Amplify REST API)",
                  },
                  { value: "fetch", label: "Direct base URL" },
                ]}
                value={transport ?? null}
                onChange={handleTransportChange}
                error={form.errors.backendTransport}
              />
            </Group>

            {backendConfigEnabled && transport === "gatey" && (
              <Stack gap={6}>
                <Select
                  classNames={{ label: classes["form-field-label"] }}
                  label={
                    <InfoLabel
                      text="REST API name"
                      scrollToId="aikit-api-backend-api-name"
                      onOpen={openInfo}
                    />
                  }
                  withAsterisk
                  data={amplifyRestApiNames}
                  placeholder={
                    amplifyRestApiNames.length
                      ? "Select a REST API"
                      : "No REST APIs detected"
                  }
                  disabled={!amplifyRestApiNames.length}
                  key={form.key("backendApiName")}
                  {...form.getInputProps("backendApiName")}
                />
                <Text size="xs" c="dimmed">
                  Uses the REST API list from your Amplify configuration (
                  <code>getAmplifyConfig().API.REST</code>).
                </Text>
              </Stack>
            )}

            {backendConfigEnabled && transport === "fetch" && (
              <Stack gap={6}>
                <TextInput
                  classNames={{ label: classes["form-field-label"] }}
                  label={
                    <InfoLabel
                      text="Backend base URL"
                      scrollToId="aikit-api-backend-base-url"
                      onOpen={openInfo}
                    />
                  }
                  withAsterisk
                  placeholder="https://api.example.com"
                  key={form.key("backendBaseUrl")}
                  {...form.getInputProps("backendBaseUrl")}
                />
                <Text size="xs" c="dimmed">
                  Enter the base URL of your AI-Kit backend (for example an API
                  Gateway endpoint).
                </Text>
              </Stack>
            )}

            {!backendConfigEnabled && (
              <Group gap="xs" align="center">
                <IconInfoCircle size={16} />
                <Text size="sm" c="dimmed">
                  Backend is disabled in <strong>On-device only</strong> mode.
                </Text>
              </Group>
            )}
          </Stack>
        </Card>

        <Group justify="flex-end">
          <Button
            type="submit"
            variant="gradient"
            loading={isSaving}
            leftSection={<IconCheck size={16} />}
          >
            Save API settings
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

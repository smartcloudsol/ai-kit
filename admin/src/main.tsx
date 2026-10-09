import {
  Accordion,
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  DEFAULT_THEME,
  Group,
  NavLink,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  AiKitConfig,
  AiKitLanguageCode,
  getAiKitPlugin,
  LANGUAGE_OPTIONS,
  reloadConfig,
  sanitizeAiKitConfig,
  TEXT_DOMAIN,
  type AiKitSettings,
  type Store,
} from "@smart-cloud/ai-kit-core";
import {
  IconAlertCircle,
  IconApi,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconExclamationCircle,
  IconInfoCircle,
  IconLock,
  IconMessage,
  IconSettings,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense } from "react";

import { useSelect } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import { useCallback, useEffect, useState } from "react";
import {
  type AiKitAdminPage,
  guardAiKitAdminPage,
  resolveAiKitAdminPage,
} from "./admin-page";
import { useAdminSectionHistory } from "./admin-section-history";
import DocSidebar from "./DocSidebar";
import { NoRegistrationRequiredBanner } from "./noregistration";
import { AiKitOnboarding } from "./onboarding";

import { SiteSettings, SubscriptionType } from "@smart-cloud/wpsuite-core";

import "jquery";

import classes from "./main.module.css";

import docSearchCurrent from "./assets/onboarding/docsearch-current.png";
import summarizerCurrent from "./assets/onboarding/summarizer-current.png";

interface Account {
  accountId: string;
  name: string;
  owner: string;
  ownerEmail: string;
  customerId?: string;
  customer: unknown;
}

export interface Site {
  accountId: string;
  siteId: string;
  siteKey?: string;
  name: string;
  domain: string;
  subscriptionType?: SubscriptionType;
  settings: AiKitConfig;
  account?: Account;
}

export interface SettingsEditorProps {
  apiUrl: string;
  config: AiKitConfig;
  accountId: string;
  siteId: string;
  siteKey: string | undefined;
  onSave: (config: AiKitConfig) => void;
  InfoLabel: (props: InfoLabelProps) => JSX.Element;
  openInfo: (targetScrollToId: string) => void;
}

type InfoLabelProps = {
  text: string;
  scrollToId: string;
  onOpen: (targetScrollToId: string) => void;
};

function InfoLabel({ text, scrollToId, onOpen }: InfoLabelProps) {
  return (
    <Group align="center" gap="0.25rem">
      {text}
      <ActionIcon
        component="label"
        variant="subtle"
        size="xs"
        onClick={() => onOpen(scrollToId)}
      >
        <IconInfoCircle size={16} />
      </ActionIcon>
    </Group>
  );
}

let wpSuiteInstalled: boolean = false;
let wpRestUrl: string | undefined;
let wpSuiteSiteSettings: SiteSettings = {} as SiteSettings;
if (typeof WpSuite !== "undefined") {
  wpSuiteInstalled = true;
  wpSuiteSiteSettings = WpSuite.siteSettings;
  wpRestUrl = WpSuite.restUrl;
}

const ApiSettingsEditor = lazy(
  () =>
    import(
      process.env.WPSUITE_PREMIUM
        ? "./paid-features/ApiSettingsEditor"
        : "./free-features/NullEditor"
    ),
);

const AiSpendPolicyEditor = lazy(
  () =>
    import(
      process.env.WPSUITE_PREMIUM
        ? "./paid-features/ai-spend-policy/AiSpendPolicyEditor"
        : "./free-features/NullEditor"
    ),
);

const ChatbotSettingsEditor = lazy(
  () =>
    import(
      process.env.WPSUITE_PREMIUM
        ? "./paid-features/ChatbotSettingsEditor"
        : "./free-features/NullEditor"
    ),
);

const ConversationProfileEditor = lazy(
  () =>
    import(
      process.env.WPSUITE_PREMIUM
        ? "./paid-features/conversation-profile/ConversationProfileEditor"
        : "./free-features/NullEditor"
    ),
);

const KBAdminEditor = lazy(
  () =>
    import(
      process.env.WPSUITE_PREMIUM
        ? "./paid-features/kb-admin/KBAdminEditor"
        : "./free-features/NullEditor"
    ),
);
const SettingsTitle = () => {
  const isMobile = useMediaQuery(
    `(max-width: ${DEFAULT_THEME.breakpoints.sm})`,
  );
  return (
    <Card p="sm" withBorder mt="md" maw={1280}>
      <Group
        align="flex-start"
        style={{
          flexDirection: "column",
          width: "100%",
        }}
      >
        <Title
          order={1}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#218BE6",
          }}
        >
          {__(
            isMobile ? "Answers" : "Answers · AI-Kit",
            TEXT_DOMAIN,
          )}
        </Title>
        <Text>
          This interface allows you to configure how AI-Kit behaves on your
          WordPress site.
        </Text>
        <Text>
          Configure output defaults and diagnostics here, then use the Pro
          sections to manage chatbot presentation, its server-side conversation
          profile, and the Knowledge Base.
        </Text>
        <NoRegistrationRequiredBanner />
        {!wpSuiteSiteSettings.siteId && (
          <>
            <Text c="dimmed" size="xs">
              To use Pro features, please connect this WordPress site to a{" "}
              <strong>WPSuite</strong> workspace. Go to the{" "}
              <a href="?page=smartcloud-wpsuite">
                <strong>SmartCloud → Connect your Site to WPSuite</strong>
              </a>{" "}
              menu and complete the linking process.
            </Text>
          </>
        )}
      </Group>
    </Card>
  );
};

interface NavigationOption {
  value: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

interface MainProps {
  nonce: string;
  settings: AiKitSettings;
  store: Store;
}

const production = process.env?.NODE_ENV === "production";

const apiUrl =
  !production || window.location.host === "dev.wpsuite.io"
    ? "https://api.wpsuite.io/dev"
    : "https://api.wpsuite.io";

const configUrl =
  !production || window.location.host === "dev.wpsuite.io"
    ? "https://wpsuite.io/static/config/dev.json"
    : "https://wpsuite.io/static/config/prod.json";

const aiKit = getAiKitPlugin();

const Main = (props: MainProps) => {
  const { store, nonce, settings } = props;
  const embedded = !!document.querySelector('[data-wpsuite-product="answers"]');

  const [navigationOptions, setNavigationOptions] =
    useState<NavigationOption[]>();
  const [scrollToId, setScrollToId] = useState<string>("");
  const [accordionValue, setAccordionValue] = useState<string | null>("ai-kit");
  const [accountId] = useState<string | undefined>(
    wpSuiteSiteSettings.accountId,
  );
  const [siteId] = useState<string | undefined>(wpSuiteSiteSettings.siteId);
  const [siteKey] = useState<string | undefined>(wpSuiteSiteSettings.siteKey);
  const [opened, { open, close }] = useDisclosure(false);

  const [site, setSite] = useState<Site | null>();

  const [settingsFormData, setSettingsFormData] = useState<AiKitSettings>({
    defaultOutputLanguage: settings?.defaultOutputLanguage || "en",
    enablePoweredBy: settings?.enablePoweredBy || false,
    debugLoggingEnabled: settings?.debugLoggingEnabled || false,
  });

  const [resolvedConfig, setResolvedConfig] = useState<
    AiKitConfig | null | undefined
  >(undefined);

  const [formConfig, setFormConfig] = useState<AiKitConfig>();

  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [requestedPage, setRequestedPage] = useState<AiKitAdminPage>(() =>
    resolveAiKitAdminPage(window.location.search),
  );
  const [activePage, setActivePage] = useState<AiKitAdminPage>(requestedPage);

  // Add media query for responsive design
  const isMobile = useMediaQuery(
    `(max-width: ${DEFAULT_THEME.breakpoints.sm})`,
  );

  const queryClient = useQueryClient();

  const decryptedConfig: AiKitConfig | null = useSelect(
    () => wp.data.select(store)?.getConfig(),
    [],
  );

  const loadSiteEnabled = !!accountId && !!siteId && !!siteKey;

  useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const response = await fetch(configUrl).catch((err) => {
        return {
          ok: true,
          statusText: err.message,
          json: async () => ({
            config: "prod",
            baseUrl: "https://wpsuite.io",
            userPoolId: "us-east-1_G0wEwK9tt",
            identityPoolId: "us-east-1:11e55c9a-b768-48a2-8a0c-c51f1e99c129",
            appClientPlugin: "5e6fs3pk1k1ju7cgpnp7o7si8u",
            awsRegion: "us-east-1",
            pricingTable: "prctbl_1QA6TQFjw5MDUzy6c3fBSPGL",
            stripePublicKey:
              "pk_live_51OVeJwFjw5MDUzy6pwTbsMjcBZjZioihzLAtxQsF91u4lYJC4mtqrJddSskhz6OPbWS0tr8XL2G1AwJaXEpv9Rgn008dAz5TEr",
            permissions: {
              owner: [
                "transfer-account",
                "manage-account",
                "manage-sites",
                "manage-subscriptions",
                "manage-billing",
              ],
              admin: [
                "manage-account",
                "manage-sites",
                "manage-subscriptions",
                "manage-billing",
              ],
              accountant: ["manage-billing"],
            },
          }),
        };
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
  });

  const {
    data: siteRecord,
    isError: isSiteError,
    isPending: isSitePending,
  } = useQuery({
    queryKey: ["site", accountId, siteId],
    queryFn: () => fetchSite(accountId!, siteId!, siteKey!),
    enabled: loadSiteEnabled,
  });

  const clearCache = useCallback(
    async (subscriber: boolean) => {
      if (wpSuiteInstalled && wpRestUrl && accountId && siteId && siteKey) {
        await fetch(wpRestUrl + "/update-site-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": nonce,
          },
          body: JSON.stringify({
            ...wpSuiteSiteSettings,
            lastUpdate: new Date().getTime(),
            subscriber,
          }),
          credentials: "same-origin",
        });
      }
    },
    [accountId, nonce, siteId, siteKey],
  );

  const handleUpdateSettings = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingSettings(true);
      try {
        const response = await fetch(aiKit.restUrl + "/update-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": nonce,
          },
          body: JSON.stringify(settingsFormData),
          credentials: "same-origin",
        });
        if (response.ok) {
          let message: string = __("Settings saved successfully.", TEXT_DOMAIN);
          const target = e.target as typeof e.target & {
            name: string;
          };
          switch (target.name) {
            case "general":
              message = __("General settings saved successfully.", TEXT_DOMAIN);
              break;
            default:
              break;
          }
          notifications.show({
            title: __("Settings saved", TEXT_DOMAIN),
            message: message,
            color: "green",
            icon: <IconInfoCircle />,
            className: classes["notification"],
          });
        } else {
          const err = await response.json();
          console.error("Failed to submit data", err);
          notifications.show({
            title: __("Error occured", TEXT_DOMAIN),
            message: (err as Error).message,
            color: "red",
            icon: <IconAlertCircle />,
            className: classes["notification"],
          });
        }
      } catch (error) {
        notifications.show({
          title: __("Error occured", TEXT_DOMAIN),
          message: (error as Error).message,
          color: "red",
          icon: <IconAlertCircle />,
          className: classes["notification"],
        });
      } finally {
        setSavingSettings(false);
      }
    },
    [nonce, settingsFormData],
  );

  const openInfo = useCallback(
    (targetScrollToId: string) => {
      setScrollToId(targetScrollToId);
      open();
    },
    [open],
  );

  const handleConfigSave = useCallback(
    async (config: AiKitConfig) => {
      setResolvedConfig({
        ...sanitizeAiKitConfig(config),
        subscriptionType: formConfig?.subscriptionType,
      });
      await clearCache(!!formConfig?.subscriptionType);
      await reloadConfig(store);
      queryClient.invalidateQueries();
    },
    [clearCache, formConfig?.subscriptionType, store, queryClient],
  );

  useEffect(() => {
    queueMicrotask(() => {
      if (isSiteError || !isSitePending || !loadSiteEnabled) {
        setSite(isSiteError ? null : siteRecord ?? null);
      }
    });
  }, [siteRecord, loadSiteEnabled, isSitePending, isSiteError]);

  useEffect(() => {
    queueMicrotask(() => {
      if (site) {
        setResolvedConfig({
          ...sanitizeAiKitConfig(site.settings ?? {}),
          subscriptionType: site.subscriptionType,
        });
      } else {
        if ((!accountId && !siteId) || isSiteError) {
          setResolvedConfig(null);
        }
      }
    });
  }, [accountId, isSiteError, site, siteId]);

  // Navigation options for both NavLink and Select
  useEffect(() => {
    queueMicrotask(() => {
      const paidSettingsDisabled =
        decryptedConfig && accountId && siteId && siteKey
          ? !decryptedConfig
          : !resolvedConfig;
      setNavigationOptions([
        {
          value: "general",
          label: __("General", TEXT_DOMAIN),
          icon: <IconSettings size={16} stroke={1.5} />,
        },
        {
          value: "api-settings",
          label: __("API Settings", TEXT_DOMAIN),
          icon: <IconApi size={16} stroke={1.5} />,
          disabled: paidSettingsDisabled,
        },
        {
          value: "chatbot-settings",
          label: __("Chatbot Settings", TEXT_DOMAIN),
          icon: <IconMessage size={16} stroke={1.5} />,
          disabled: paidSettingsDisabled,
        },
        {
          value: "conversation-profile",
          label: __("Conversation Profile", TEXT_DOMAIN),
          icon: <IconMessage size={16} stroke={1.5} />,
          disabled: paidSettingsDisabled,
        },
        {
          value: "kb-admin",
          label: __("Knowledge Base", TEXT_DOMAIN),
          icon: <IconBook size={16} stroke={1.5} />,
          disabled: paidSettingsDisabled,
        },
      ]);
      if (paidSettingsDisabled && resolvedConfig !== undefined) {
        setActivePage(page => guardAiKitAdminPage(page, true, false));
      }
    });
  }, [accountId, decryptedConfig, resolvedConfig, siteId, siteKey]);

  useEffect(() => {
    queueMicrotask(() => {
      if (resolvedConfig !== undefined) {
        const fc = (resolvedConfig ?? decryptedConfig) as AiKitConfig;
        setFormConfig(fc);
      }
    });
  }, [resolvedConfig, decryptedConfig]);

  useEffect(() => {
    if (resolvedConfig !== undefined) {
      if (
        resolvedConfig !== null &&
        ((!!resolvedConfig.subscriptionType &&
          !wpSuiteSiteSettings.subscriber) ||
          (!resolvedConfig.subscriptionType && wpSuiteSiteSettings.subscriber))
      ) {
        const subscriber = !!resolvedConfig.subscriptionType;
        wpSuiteSiteSettings.subscriber = subscriber;
        clearCache(subscriber);
      }
    }
  }, [clearCache, resolvedConfig]);

  const navigatePage = useAdminSectionHistory(activePage, resolveAiKitAdminPage, next => {
    const accepted = guardAiKitAdminPage(next, resolvedConfig !== undefined,
      !!resolvedConfig || !!(decryptedConfig && accountId && siteId && siteKey));
    setRequestedPage(next);
    setActivePage(accepted);
    return accepted;
  });

  return (
    <div className={classes["wpc-container"]}>
      <DocSidebar
        opened={opened}
        close={close}
        page={activePage}
        scrollToId={scrollToId}
      />
      {!embedded && <SettingsTitle />}
      {!embedded && <AiKitOnboarding screenshots={{
        proBlock: [
          { title: __("Embedded DocSearch: visitor search and explicit filters", TEXT_DOMAIN), src: docSearchCurrent },
          { title: __("Summarize this page: a focused visitor action", TEXT_DOMAIN), src: summarizerCurrent },
        ],
      }} />}
      <Group
        align="flex-start"
        mt="lg"
        style={{
          flexDirection: isMobile ? "column" : "row",
          width: "100%",
        }}
      >
        {isMobile ? (
          <Accordion
            w="100%"
            value={accordionValue}
            onChange={setAccordionValue}
            variant="separated"
          >
            <Accordion.Item value="ai-kit">
              <Accordion.Control>
                <Text fw={600}>{__("AI-Kit", TEXT_DOMAIN)}</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {navigationOptions?.slice(0, 1).map((item) => (
                    <NavLink
                      key={item.value}
                      label={item.label}
                      leftSection={item.icon}
                      rightSection={
                        activePage === item.value ? (
                          <IconChevronRight size={16} stroke={1.5} />
                        ) : null
                      }
                      active={activePage === item.value}
                      onClick={() => {
                        navigatePage(
                          item.value as AiKitAdminPage,
                        );
                      }}
                      disabled={item.disabled}
                    />
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="pro-features">
              <Accordion.Control>
                <Text fw={600}>{__("Pro Features", TEXT_DOMAIN)}</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {navigationOptions?.slice(1).map((item) => (
                    <NavLink
                      key={item.value}
                      label={item.label}
                      leftSection={item.icon}
                      rightSection={
                        item.disabled ||
                        !(formConfig ?? decryptedConfig)?.subscriptionType ? (
                          <IconLock size={14} stroke={1.5} />
                        ) : activePage === item.value ? (
                          <IconChevronRight size={16} stroke={1.5} />
                        ) : null
                      }
                      active={activePage === item.value}
                      onClick={() => {
                        if (!item.disabled) {
                          navigatePage(
                            item.value as AiKitAdminPage,
                          );
                        }
                      }}
                      disabled={item.disabled}
                    />
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        ) : (
          <Card w={240} p="md" withBorder style={{ flexShrink: 0 }}>
            <Stack gap="lg">
              <Box>
                <Text size="sm" fw={600} mb="xs" c="dimmed">
                  {__("AI-Kit", TEXT_DOMAIN)}
                </Text>
                <Stack gap={0}>
                  {navigationOptions
                    ?.slice(0, 1)
                    .map((item) => (
                      <NavLink
                        key={item.value}
                        label={item.label}
                        leftSection={item.icon}
                        rightSection={
                          activePage === item.value ? (
                            <IconChevronRight size={16} stroke={1.5} />
                          ) : null
                        }
                        active={activePage === item.value}
                        onClick={() =>
                          navigatePage(
                            item.value as AiKitAdminPage,
                          )
                        }
                        disabled={item.disabled}
                      />
                    ))}
                </Stack>
              </Box>
              <Box>
                <Text size="sm" fw={600} mb="xs" c="dimmed">
                  {__("Pro Features", TEXT_DOMAIN)}
                </Text>
                <Stack gap={0}>
                  {navigationOptions?.slice(1).map((item) => (
                    <NavLink
                      key={item.value}
                      label={item.label}
                      leftSection={item.icon}
                      rightSection={
                        item.disabled ||
                        !(formConfig ?? decryptedConfig)?.subscriptionType ? (
                          <IconLock size={14} stroke={1.5} />
                        ) : activePage === item.value ? (
                          <IconChevronRight size={16} stroke={1.5} />
                        ) : null
                      }
                      active={activePage === item.value}
                      onClick={() => {
                        if (!item.disabled) {
                          navigatePage(
                            item.value as AiKitAdminPage,
                          );
                        }
                      }}
                      disabled={item.disabled}
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </Card>
        )}
        <Box style={{ flex: 1, width: isMobile ? "100%" : "auto" }} maw={1020}>
          {requestedPage !== "general" && activePage === "general"
            && resolvedConfig !== undefined
            && !(decryptedConfig && accountId && siteId && siteKey) && !resolvedConfig && (
              <Alert color="yellow" variant="light" title={__("Requested section unavailable", TEXT_DOMAIN)} icon={<IconExclamationCircle />} mb="md">
                {__("The linked section needs a connected site configuration. General preferences remain available without a site connection.", TEXT_DOMAIN)}
              </Alert>
            )}
          {activePage === "general" && (
            <form name="general" onSubmit={handleUpdateSettings}>
              <Title order={2} mb="md">
                General
              </Title>

              <Text mb="md">
                Control AI-Kit output defaults, diagnostics, and UI attribution.
              </Text>

              <Stack gap="sm">
                <Select
                  disabled={savingSettings}
                  label={
                    <InfoLabel
                      text="Default output language"
                      scrollToId="default-output-language"
                      onOpen={openInfo}
                    />
                  }
                  description="The language AI-Kit should use for generated text by default (when applicable)."
                  data={[
                    { value: "", label: __("--- Select ---", TEXT_DOMAIN) },
                    ...LANGUAGE_OPTIONS,
                  ]}
                  value={settingsFormData.defaultOutputLanguage || "en"}
                  onChange={(value) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      defaultOutputLanguage: (value ||
                        "en") as AiKitLanguageCode,
                    })
                  }
                />
                <Switch.Group
                  defaultValue={
                    settingsFormData.enablePoweredBy ? [] : ["hide"]
                  }
                  label={
                    <InfoLabel
                      text="Hide 'Powered by' attribution"
                      scrollToId="hide-powered-by-ai-kit"
                      onOpen={openInfo}
                    />
                  }
                  description="Hide the 'Powered by' attribution where AI-Kit renders frontend UI."
                  onChange={(values: string[]) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      enablePoweredBy: !values.includes("hide"),
                    })
                  }
                >
                  <Switch label="Hide" value="hide" mt="xs" />
                </Switch.Group>

                <Switch.Group
                  defaultValue={
                    settingsFormData.debugLoggingEnabled ? ["enable"] : []
                  }
                  label={
                    <InfoLabel
                      text={__("Enable Debug Logging", TEXT_DOMAIN)}
                      scrollToId="enable-debug-logging"
                      onOpen={openInfo}
                    />
                  }
                  description={__(
                    "Enable detailed debug logging for AI-Kit operations. Note: This requires WP_DEBUG and WP_DEBUG_LOG to be enabled in wp-config.php. Logs will appear in wp-content/debug.log.",
                    TEXT_DOMAIN,
                  )}
                  onChange={(values: string[]) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      debugLoggingEnabled: values.includes("enable"),
                    })
                  }
                >
                  <Switch
                    label={__("Enable", TEXT_DOMAIN)}
                    value="enable"
                    mt="xs"
                    disabled={savingSettings}
                  />
                </Switch.Group>
              </Stack>

              <Group justify="flex-end" mt="lg">
                <Button
                  loading={savingSettings}
                  variant="gradient"
                  type="submit"
                  leftSection={<IconCheck />}
                >
                  Save General Settings
                </Button>
              </Group>
            </form>
          )}
          {activePage === "api-settings" && (
            <>
              <Title order={2} mb="md">
                <InfoLabel
                  text="API Settings"
                  scrollToId="api-settings"
                  onOpen={openInfo}
                />
              </Title>

              <Text mb="md">
                Configure how AI-Kit reaches its backend for AI features. Choose
                local vs backend execution, and how to call the backend
                (Amplify/Gatey or direct base URL).
              </Text>

              {!(formConfig ?? decryptedConfig)?.subscriptionType && (
                <Alert
                  variant="light"
                  color="yellow"
                  title="PRO Feature"
                  icon={<IconExclamationCircle />}
                  mb="md"
                >
                  This feature is available in the <strong>PRO</strong> version
                  of the plugin. You can save your settings but they will not
                  take effect until you upgrade your subscription.
                </Alert>
              )}
              {(formConfig ?? decryptedConfig) && (
                <Suspense fallback={<Text>Loading...</Text>}>
                  <ApiSettingsEditor
                    apiUrl={apiUrl}
                    config={formConfig ?? decryptedConfig}
                    accountId={accountId!}
                    siteId={siteId!}
                    siteKey={siteKey!}
                    onSave={handleConfigSave}
                    InfoLabel={InfoLabel}
                    openInfo={openInfo}
                  />
                  <AiSpendPolicyEditor />
                </Suspense>
              )}
            </>
          )}
          {activePage === "chatbot-settings" && (
            <>
              <Title order={2} mb="md">
                <InfoLabel
                  text="Chatbot Settings"
                  scrollToId="chatbot-settings"
                  onOpen={openInfo}
                />
              </Title>

              <Text mb={0}>
                Configure how AI-Kit Chatbot behaves on your site — appearance,
                position, and default messages.
              </Text>

              <Text mb="md">
                Use Preview to instantly try your current settings without
                saving. While previewing, the live site button is hidden and a
                preview button appears instead — to apply these settings on your
                site, enable the chatbot and Save your changes.
              </Text>

              {!(formConfig ?? decryptedConfig)?.subscriptionType && (
                <Alert
                  variant="light"
                  color="yellow"
                  title="PRO Feature"
                  icon={<IconExclamationCircle />}
                  mb="md"
                >
                  This feature is available in the <strong>PRO</strong> version
                  of the plugin. You can save your settings but they will not
                  take effect until you upgrade your subscription.
                </Alert>
              )}
              {(formConfig ?? decryptedConfig) && (
                <Suspense fallback={<Text>Loading...</Text>}>
                  <ChatbotSettingsEditor
                    apiUrl={apiUrl}
                    config={formConfig ?? decryptedConfig}
                    accountId={accountId!}
                    siteId={siteId!}
                    siteKey={siteKey!}
                    onSave={handleConfigSave}
                    InfoLabel={InfoLabel}
                    openInfo={openInfo}
                    store={store}
                  />
                </Suspense>
              )}
            </>
          )}
          {activePage === "conversation-profile" && (
            <>
              <Title order={2} mb="md">
                {__("Conversation Profile", TEXT_DOMAIN)}
              </Title>
              <Text mb="md">
                Define the server-owned identity, scope, goals, actions,
                grounding, tools, model, safety, and memory policy used for
                visitor conversations.
              </Text>
              {!(formConfig ?? decryptedConfig)?.subscriptionType && (
                <Alert
                  variant="light"
                  color="yellow"
                  title="PRO Feature"
                  icon={<IconExclamationCircle />}
                  mb="md"
                >
                  This feature requires the <strong>PRO</strong> plugin and a
                  compatible AI Kit backend.
                </Alert>
              )}
              {(formConfig ?? decryptedConfig) && (
                <Suspense fallback={<Text>Loading...</Text>}>
                  <ConversationProfileEditor
                    chatTitle={(formConfig ?? decryptedConfig)?.chatbot?.title}
                    InfoLabel={InfoLabel}
                    openInfo={openInfo}
                  />
                </Suspense>
              )}
            </>
          )}
          {activePage === "kb-admin" && (
            <>
              <Title order={2} mb="md">
                <InfoLabel
                  text="Knowledge Base Admin"
                  scrollToId="kb-admin"
                  onOpen={openInfo}
                />
              </Title>

              <Text mb="md">
                Manage your AI-Kit Knowledge Base sources — add URL patterns,
                sync documentation, override sections, and publish to make them
                available for AI-powered search and assistance.
              </Text>

              {!(formConfig ?? decryptedConfig)?.subscriptionType && (
                <Alert
                  variant="light"
                  color="yellow"
                  title="PRO Feature"
                  icon={<IconExclamationCircle />}
                  mb="md"
                >
                  This feature is available in the <strong>PRO</strong> version
                  of the plugin. You can save your settings but they will not
                  take effect until you upgrade your subscription.
                </Alert>
              )}
              {(formConfig ?? decryptedConfig) && (
                <Suspense fallback={<Text>Loading...</Text>}>
                  <KBAdminEditor
                    apiUrl={apiUrl}
                    config={formConfig ?? decryptedConfig}
                    accountId={accountId!}
                    siteId={siteId!}
                    siteKey={siteKey!}
                    onSave={handleConfigSave}
                    InfoLabel={InfoLabel}
                    openInfo={openInfo}
                  />
                </Suspense>
              )}
            </>
          )}
        </Box>
      </Group>
    </div>
  );
};

async function fetchSite(accountId: string, siteId: string, siteKey: string) {
  try {
    const response = await fetch(
      `${apiUrl}/account/${accountId}/site/${siteId}/settings`,
      {
        method: "GET",
        headers: {
          "X-Plugin": "ai-kit",
          "X-Site-Key": siteKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch site: ${response.statusText}`);
    }

    const body = await response.json();
    return body as unknown as Site;
  } catch (err) {
    console.error("fetchSite error:", err);
    throw err;
  }
}

export default Main;

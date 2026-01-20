import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DEFAULT_THEME,
  Group,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  AiKitConfig,
  AiKitLanguageCode,
  getAiKitPlugin,
  LANGUAGE_OPTIONS,
  sanitizeAiKitConfig,
  TEXT_DOMAIN,
  type AiKitSettings,
  type Store,
} from "@smart-cloud/ai-kit-core";
import {
  IconAlertCircle,
  IconApi,
  IconCheck,
  IconExclamationCircle,
  IconInfoCircle,
  IconSettings,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { lazy } from "react";

import { __experimentalHeading as Heading } from "@wordpress/components";
import { useSelect } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import { useCallback, useEffect, useState } from "react";
import DocSidebar from "./DocSidebar";
import { AiKitOnboarding } from "./onboarding";
import { NoRegistrationRequiredBanner } from "./noregistration";

import { SiteSettings, SubscriptionType } from "@smart-cloud/wpsuite-core";

import "jquery";

import classes from "./main.module.css";

import mediaModal from "./assets/onboarding/media-modal.jpg";
import mediaGridBulkModal from "./assets/onboarding/media-grid-bulk-modal.jpg";
import mediaAttachmentEdit from "./assets/onboarding/media-attachment-edit.jpg";
import sidebarPostMetadata from "./assets/onboarding/sidebar-post-metadata.jpg";
import sidebarTextGeneration from "./assets/onboarding/sidebar-text-generation.jpg";
import aiKitToolsToolbar from "./assets/onboarding/ai-kit-tools-toolbar.jpg";
import exampleProofreadModal from "./assets/onboarding/example-proofread-modal.jpg";
import exampleTranslateModal from "./assets/onboarding/example-translate-modal.jpg";
import exampleRewriteModal from "./assets/onboarding/example-rewrite-modal.jpg";
import gutenbergSeoMetadataPanel from "./assets/onboarding/gutenberg-seo-image-metadata-panel.jpg"; //
import proFrontendBlocks from "./assets/onboarding/pro-frontend-blocks.jpg";
import proFrontendBlocksOptions from "./assets/onboarding/pro-frontend-blocks-options.jpg";
import shortcode from "./assets/onboarding/shortcode.jpg";
import shortcodeFrontend from "./assets/onboarding/shortcode-frontend.jpg";
import featuresApi from "./assets/onboarding/features-api.jpg";
import renderFeature from "./assets/onboarding/render-feature.jpg";

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
  InfoLabelComponent: (props: {
    text: string;
    scrollToId: string;
  }) => JSX.Element;
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
        <Heading
          level={1}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#218BE6",
          }}
        >
          {__(
            isMobile ? "AI-Kit" : "AI-Kit — AI tools for WordPress",
            TEXT_DOMAIN,
          )}
        </Heading>
        <Text>
          This interface allows you to configure how AI-Kit behaves on your
          WordPress site.
        </Text>
        <Text>
          Set an optional <strong>Shared context</strong>, configure{" "}
          <strong>reCAPTCHA</strong> for bot protection, and control whether to
          show a small <strong>Powered by AI-Kit</strong> attribution (where
          applicable).
        </Text>
        <NoRegistrationRequiredBanner />
        {!wpSuiteSiteSettings.siteId && (
          <>
            <Text c="dimmed" size="xs">
              To use Pro features, please connect this WordPress instance to a{" "}
              <strong>WPSuite.io</strong> site. Go to the{" "}
              <a href="?page=hub-for-wpsuiteio">
                <strong>WPSuite.io → Connect your Site</strong>
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
  badge?: React.ReactNode;
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

  const [navigationOptions, setNavigationOptions] =
    useState<NavigationOption[]>();
  const [scrollToId, setScrollToId] = useState<string>("");
  const [accountId] = useState<string | undefined>(
    wpSuiteSiteSettings.accountId,
  );
  const [siteId] = useState<string | undefined>(wpSuiteSiteSettings.siteId);
  const [siteKey] = useState<string | undefined>(wpSuiteSiteSettings.siteKey);
  const [opened, { open, close }] = useDisclosure(false);

  const [site, setSite] = useState<Site | null>();

  const [settingsFormData, setSettingsFormData] = useState<AiKitSettings>({
    sharedContext: settings?.sharedContext || "",
    defaultOutputLanguage: settings?.defaultOutputLanguage || "en",
    reCaptchaSiteKey: settings?.reCaptchaSiteKey || "",
    useRecaptchaEnterprise: settings?.useRecaptchaEnterprise || false,
    useRecaptchaNet: settings?.useRecaptchaNet || false,
    enablePoweredBy: settings?.enablePoweredBy || false,
  });

  const [resolvedConfig, setResolvedConfig] = useState<
    AiKitConfig | null | undefined
  >(undefined);

  const [formConfig, setFormConfig] = useState<AiKitConfig>();

  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [activePage, setActivePage] = useState<"general" | "api-settings">(
    "general",
  );

  // Add media query for responsive design
  const isMobile = useMediaQuery(
    `(max-width: ${DEFAULT_THEME.breakpoints.sm})`,
  );

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
    (subscriber: boolean) => {
      if (wpSuiteInstalled && wpRestUrl && accountId && siteId && siteKey) {
        fetch(wpRestUrl + "/update-site-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": nonce,
          },
          body: JSON.stringify({
            accountId,
            siteId,
            siteKey,
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
    [settingsFormData, nonce],
  );

  const InfoLabelComponent = useCallback(
    ({ text, scrollToId }: { text: string; scrollToId: string }) => (
      <Group align="center" gap="0.25rem">
        {text}
        <ActionIcon
          component="label"
          variant="subtle"
          size="xs"
          onClick={() => {
            setScrollToId(scrollToId);
            open();
          }}
        >
          <IconInfoCircle size={16} />
        </ActionIcon>
      </Group>
    ),
    [open],
  );

  const handleConfigSave = useCallback(
    (config: AiKitConfig) => {
      setFormConfig({
        ...sanitizeAiKitConfig(config),
        subscriptionType: formConfig?.subscriptionType,
      });
      clearCache(!!formConfig?.subscriptionType);
    },
    [clearCache, formConfig?.subscriptionType],
  );

  useEffect(() => {
    if (isSiteError || !isSitePending || !loadSiteEnabled) {
      setSite(isSiteError ? null : siteRecord ?? null);
    }
  }, [siteRecord, loadSiteEnabled, isSitePending, isSiteError]);

  useEffect(() => {
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
  }, [accountId, isSiteError, site, siteId]);

  // Navigation options for both NavLink and Select
  useEffect(() => {
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
        badge: (
          <Badge variant="light" color="red" ml="4px" miw={35}>
            PRO
          </Badge>
        ),
        disabled: paidSettingsDisabled,
      },
    ]);
    if (paidSettingsDisabled) {
      setActivePage("general");
    }
  }, [accountId, decryptedConfig, resolvedConfig, siteId, siteKey]);

  useEffect(() => {
    if (resolvedConfig !== undefined) {
      const fc = (resolvedConfig ?? decryptedConfig) as AiKitConfig;
      setFormConfig(fc);
    }
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

  return (
    <div className={classes["wpc-container"]}>
      <DocSidebar
        opened={opened}
        close={close}
        page={activePage as never}
        scrollToId={scrollToId}
      />
      <SettingsTitle />
      <AiKitOnboarding
        screenshots={{
          media: [
            {
              title: __("Grid: attachment popup", TEXT_DOMAIN),
              src: mediaModal,
              alt: __(
                "Media Library: Grid → attachment popup (SEO box)",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Grid: bulk select modal", TEXT_DOMAIN),
              src: mediaGridBulkModal,
              alt: __(
                "Media Library: Grid → bulk select (generate / preview)",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Attachment edit screen (post.php)", TEXT_DOMAIN),
              src: mediaAttachmentEdit,
              alt: __(
                "Attachment edit screen (post.php): SEO metadata box",
                TEXT_DOMAIN,
              ),
            },
          ],
          sidebar: [
            {
              title: __("Generate post metadata sidebar", TEXT_DOMAIN),
              src: sidebarPostMetadata,
              alt: __(
                "Gutenberg: AI-Kit Sidebar → Generate post metadata",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Text generation sidebar", TEXT_DOMAIN),
              src: sidebarTextGeneration,
              alt: __(
                "Gutenberg: AI-Kit Sidebar → Text generation",
                TEXT_DOMAIN,
              ),
            },
          ],
          toolbar: [
            {
              title: __("AI-Kit Tools toolbar dropdown", TEXT_DOMAIN),
              src: aiKitToolsToolbar,
              alt: __(
                "Gutenberg: Select text → AI-Kit Tools toolbar dropdown",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Example proofread modal", TEXT_DOMAIN),
              src: exampleProofreadModal,
              alt: __("Gutenberg: Example proofread modal window", TEXT_DOMAIN),
            },
            {
              title: __("Example translate modal", TEXT_DOMAIN),
              src: exampleTranslateModal,
              alt: __("Gutenberg: Example translate modal window", TEXT_DOMAIN),
            },
            {
              title: __("Example rewrite modal", TEXT_DOMAIN),
              src: exampleRewriteModal,
              alt: __("Gutenberg: Example rewrite modal window", TEXT_DOMAIN),
            },
          ],
          imagePanel: [
            {
              title: __("Image SEO metadata panel", TEXT_DOMAIN),
              src: gutenbergSeoMetadataPanel,
              alt: __(
                "Gutenberg: Image/Cover/Media-Text → SEO metadata generation",
                TEXT_DOMAIN,
              ),
            },
          ],
          proBlock: [
            {
              title: __("Pro Frontend Blocks", TEXT_DOMAIN),
              src: proFrontendBlocks,
              alt: __(
                "AI-Kit Feature (PRO) block: front-end feature generation",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Pro Frontend Blocks Options", TEXT_DOMAIN),
              src: proFrontendBlocksOptions,
              alt: __(
                "AI-Kit Feature (PRO) block: options panel for frontend blocks",
                TEXT_DOMAIN,
              ),
            },
          ],
          shortcode: [
            {
              title: __("Shortcode example", TEXT_DOMAIN),
              src: shortcode,
              alt: __(
                "[ai-kit-feature] shortcode embedded in a page",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Shortcode Frontend Output", TEXT_DOMAIN),
              src: shortcodeFrontend,
              alt: __(
                "[ai-kit-feature] shortcode frontend output example",
                TEXT_DOMAIN,
              ),
            },
          ],
          api: [
            {
              title: __("Features API", TEXT_DOMAIN),
              src: featuresApi,
              alt: __(
                "Using WpSuite.plugins.aiKit.features.* in custom code",
                TEXT_DOMAIN,
              ),
            },
            {
              title: __("Rendering flow", TEXT_DOMAIN),
              src: renderFeature,
              alt: __(
                "Example: renderFeature() injecting a UI into the front-end",
                TEXT_DOMAIN,
              ),
            },
          ],
        }}
      />
      <Group
        align="flex-start"
        mt="lg"
        style={{
          flexDirection: isMobile ? "column" : "row",
          width: "100%",
        }}
      >
        <Tabs
          classNames={{
            tabLabel: classes["wpc-tabs-label"],
            panel:
              classes[isMobile ? "wpc-tabs-panel-mobile" : "wpc-tabs-panel"],
          }}
          value={activePage}
          orientation={isMobile ? "horizontal" : "vertical"}
          onChange={(value) =>
            setActivePage(value as "general" | "api-settings")
          }
          w="100%"
        >
          <Tabs.List>
            {navigationOptions?.map((item) => (
              <Tabs.Tab
                key={item.value}
                value={item.value}
                disabled={item.disabled}
              >
                {item.icon}
                {!isMobile && item.label}
                {item.badge}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="general" w="100%">
            <form name="general" onSubmit={handleUpdateSettings}>
              <Title order={2} mb="md">
                General
              </Title>

              <Text mb="md">
                Control how AI-Kit behaves across your site — global context,
                bot protection, and UI attribution.
              </Text>

              <Stack gap="sm">
                <Textarea
                  disabled={savingSettings}
                  label={
                    <InfoLabelComponent
                      text="Shared Context"
                      scrollToId="shared-context"
                    />
                  }
                  description="Optional. A global context string sent with AI requests. Use your site’s frontend language or English. If you generate content in multiple languages (write, rewrite, SEO metadata), keep this context in English for consistency."
                  resize="vertical"
                  minRows={3}
                  value={settingsFormData.sharedContext}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      sharedContext: e.target.value,
                    })
                  }
                />
                <Select
                  disabled={savingSettings}
                  label={
                    <InfoLabelComponent
                      text="Default output language"
                      scrollToId="default-output-language"
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
                <TextInput
                  disabled={savingSettings}
                  label={
                    <InfoLabelComponent
                      text="Google reCAPTCHA (v3) Site Key"
                      scrollToId="recaptcha-site-key"
                    />
                  }
                  description="Create the key in your reCAPTCHA project, then paste it here."
                  value={settingsFormData.reCaptchaSiteKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      reCaptchaSiteKey: e.target.value,
                    })
                  }
                />
                <Checkbox
                  disabled={savingSettings}
                  label={
                    <InfoLabelComponent
                      text="Use reCAPTCHA Enterprise"
                      scrollToId="use-recaptcha-enterprise"
                    />
                  }
                  checked={settingsFormData.useRecaptchaEnterprise}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      useRecaptchaEnterprise: e.currentTarget.checked,
                    })
                  }
                />
                <Checkbox
                  disabled={savingSettings}
                  label={
                    <InfoLabelComponent
                      text="Use recaptcha.net"
                      scrollToId="use-recaptcha-net"
                    />
                  }
                  checked={settingsFormData.useRecaptchaNet}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      useRecaptchaNet: e.currentTarget.checked,
                    })
                  }
                />
                <TextInput
                  disabled={savingSettings}
                  label={
                    <InfoLabelComponent
                      text="Custom Translations URL"
                      scrollToId="custom-translations-url"
                    />
                  }
                  description={
                    <>
                      <Text size="sm" m={0}>
                        If you want to use custom translations, enter the URL
                        here. The URL should point to a JSON file. Download{" "}
                        <a
                          href="https://wpsuite.io/static/plugins/gatey-translations.json"
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                        >
                          sample translations
                        </a>
                        , modify it, and upload it to your server or a public
                        file hosting service.
                      </Text>
                    </>
                  }
                  value={settingsFormData.customTranslationsUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      customTranslationsUrl: e.target.value,
                    })
                  }
                />
                <Switch.Group
                  defaultValue={
                    settingsFormData.enablePoweredBy ? [] : ["hide"]
                  }
                  label={
                    <InfoLabelComponent
                      text="Hide 'Powered by AI-Kit' text"
                      scrollToId="hide-powered-by-ai-kit"
                    />
                  }
                  description="Hide the 'Powered by AI-Kit' text where AI-Kit renders frontend UI."
                  onChange={(values: string[]) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      enablePoweredBy: !values.includes("hide"),
                    })
                  }
                >
                  <Switch label="Hide" value="hide" mt="xs" />
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
          </Tabs.Panel>
          <Tabs.Panel value="api-settings" w="100%">
            <Title order={2} mb="md">
              <InfoLabelComponent
                text="API Settings"
                scrollToId="api-settings"
              />
            </Title>

            <Text mb="md">
              Configure how AI-Kit reaches its backend for AI features. Choose
              local vs backend execution, and how to call the backend
              (Amplify/Gatey or direct base URL).
            </Text>

            {(formConfig ?? decryptedConfig)?.subscriptionType !==
              "PROFESSIONAL" && (
              <Alert
                variant="light"
                color="yellow"
                title="PRO Feature"
                icon={<IconExclamationCircle />}
                mb="md"
              >
                This feature is available in the <strong>PRO</strong> version of
                the plugin. You can save your settings but they will not take
                effect until you upgrade your subscription.
              </Alert>
            )}
            {(formConfig ?? decryptedConfig) && (
              <ApiSettingsEditor
                apiUrl={apiUrl}
                config={formConfig ?? decryptedConfig}
                accountId={accountId!}
                siteId={siteId!}
                siteKey={siteKey!}
                onSave={handleConfigSave}
                InfoLabelComponent={InfoLabelComponent}
              />
            )}
          </Tabs.Panel>
        </Tabs>
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

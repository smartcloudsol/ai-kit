import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AnyCreateCoreOptions,
  decideCapability,
  getMinChromeVersions,
  LANGUAGE_OPTIONS,
  TEXT_DOMAIN,
  type AiKitLanguageCode,
  type BuiltInAiFeature,
  type CapabilityDecision,
} from "@smart-cloud/ai-kit-core";

import { __, sprintf } from "@wordpress/i18n";

import {
  Alert,
  Badge,
  Box,
  Code,
  CopyButton,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconX,
} from "@tabler/icons-react";

type DecisionView = CapabilityDecision & {
  onDeviceAvailable?: boolean;
  onDeviceStatus?: string;
  onDeviceReason?: string;

  backendAvailable?: boolean;
  backendReason?: string;
};

type FeatureMeta = {
  key: BuiltInAiFeature;
  label: string;
  originTrial?: boolean;
};

type FeatureInfo = FeatureMeta & {
  minChrome: number;
};

type Row = FeatureInfo & {
  decision?: DecisionView;
  error?: string;
  skipped?: boolean;
  note?: string;
};

const FEATURE_META: FeatureMeta[] = [
  { key: "summarizer", label: __("Summarizer API", TEXT_DOMAIN) },
  { key: "translator", label: __("Translator API", TEXT_DOMAIN) },
  { key: "language-detector", label: __("Language Detector API", TEXT_DOMAIN) },

  { key: "writer", label: __("Writer API", TEXT_DOMAIN), originTrial: true },
  {
    key: "rewriter",
    label: __("Rewriter API", TEXT_DOMAIN),
    originTrial: true,
  },
  {
    key: "proofreader",
    label: __("Proofreader API", TEXT_DOMAIN),
    originTrial: true,
  },
  {
    key: "prompt",
    label: __("Prompt API (LanguageModel)", TEXT_DOMAIN),
    originTrial: true,
  },
];

const PROMPT_MULTIMODAL_AVAILABILITY: LanguageModelCreateCoreOptions = {
  expectedInputs: [{ type: "image" }, { type: "text", languages: ["en"] }],
};

function dash(): string {
  return __("—", TEXT_DOMAIN);
}

function statusBadge(status?: string) {
  if (!status) return <Badge variant="light">{dash()}</Badge>;
  const s = status.toLowerCase();

  if (s === "available")
    return <Badge color="green">{__("available", TEXT_DOMAIN)}</Badge>;
  if (s === "unavailable")
    return <Badge color="red">{__("unavailable", TEXT_DOMAIN)}</Badge>;
  if (s.includes("download"))
    return <Badge color="yellow">{__("download", TEXT_DOMAIN)}</Badge>;
  if (s.includes("api-not-present"))
    return <Badge color="gray">{__("api-not-present", TEXT_DOMAIN)}</Badge>;

  return <Badge variant="light">{status}</Badge>;
}

function AvailabilityIcon({ value }: { value: boolean | undefined }) {
  if (value === true) {
    return (
      <Tooltip label={__("Yes", TEXT_DOMAIN)} withArrow>
        <Box style={{ display: "inline-flex" }}>
          <IconCheck size={18} color="green" />
        </Box>
      </Tooltip>
    );
  }
  if (value === false) {
    return (
      <Tooltip label={__("No", TEXT_DOMAIN)} withArrow>
        <Box style={{ display: "inline-flex" }}>
          <IconX size={18} color="red" />
        </Box>
      </Tooltip>
    );
  }
  return <Text size="sm">{dash()}</Text>;
}

function explanationForRow(row: Row): string {
  if (row.skipped) return row.note ?? __("Skipped.", TEXT_DOMAIN);
  if (row.error) return __("Check failed (see Error).", TEXT_DOMAIN);

  const d = row.decision;
  if (!d) return dash();

  if (d.onDeviceAvailable === true) {
    if (row.key === "prompt") {
      return __(
        "On-device Prompt API is available (multimodal check passed).",
        TEXT_DOMAIN,
      );
    }
    return __("On-device API is available.", TEXT_DOMAIN);
  }

  if (d.onDeviceAvailable === false) {
    if (d.onDeviceReason && d.onDeviceReason.length > 0)
      return d.onDeviceReason;
    if (d.onDeviceStatus && d.onDeviceStatus.length > 0) {
      return sprintf(
        __("On-device unavailable: %s", TEXT_DOMAIN),
        d.onDeviceStatus,
      );
    }
    return __("On-device API is unavailable.", TEXT_DOMAIN);
  }

  return dash();
}

function CopyableValue({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap">
      <Text size="sm">{label}</Text>

      <Group gap="xs" wrap="nowrap">
        <Code>{value}</Code>
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Tooltip
              label={
                copied ? __("Copied", TEXT_DOMAIN) : __("Copy", TEXT_DOMAIN)
              }
              withArrow
            >
              <Box
                onClick={copy}
                style={{ cursor: "pointer", display: "inline-flex" }}
                aria-label={__("Copy to clipboard", TEXT_DOMAIN)}
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </Box>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Group>
  );
}

// Flags (copy-only; Chrome blocks clicking chrome:// links from pages)
const FLAG_ON_DEVICE_MODEL =
  "chrome://flags/#optimization-guide-on-device-model";
const FLAG_PROMPT_API = "chrome://flags/#prompt-api-for-gemini-nano";
const FLAG_PROMPT_MULTIMODAL =
  "chrome://flags/#prompt-api-for-gemini-nano-multimodal-input";
const FLAG_WRITER = "chrome://flags/#writer-api-for-gemini-nano";
const FLAG_REWRITER = "chrome://flags/#rewriter-api-for-gemini-nano";
const FLAG_PROOFREADER = "chrome://flags/#proofreader-api-for-gemini-nano";

export default function Diagnostics() {
  const [loading, setLoading] = useState<boolean>(true);
  const [features, setFeatures] = useState<FeatureInfo[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  // Translator options (rendered inside translator row)
  const [sourceLanguage, setSourceLanguage] =
    useState<AiKitLanguageCode | null>(null);
  const [targetLanguage, setTargetLanguage] =
    useState<AiKitLanguageCode | null>(null);

  const languageOptions = useMemo(
    () => LANGUAGE_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    [],
  );

  const translatorReady = useMemo(() => {
    if (!sourceLanguage || !targetLanguage) return false;
    if (sourceLanguage === targetLanguage) return false;
    return true;
  }, [sourceLanguage, targetLanguage]);

  const decide = useCallback(
    async (
      feature: BuiltInAiFeature,
      availabilityOptions?: AnyCreateCoreOptions,
    ): Promise<DecisionView> => {
      const d = (await decideCapability(
        feature,
        availabilityOptions,
        "backend-fallback",
      )) as DecisionView;
      return d;
    },
    [],
  );

  // 1) Load min Chrome versions async and build features list
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const min = await getMinChromeVersions();

      const filled: FeatureInfo[] = FEATURE_META.map((m) => ({
        ...m,
        minChrome:
          typeof min?.[m.key] === "number" ? (min[m.key] as number) : 0,
      }));

      if (!cancelled) {
        setFeatures(filled);
        setRows(filled.map((f) => ({ ...f })));
      }
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Run checks after features are loaded; re-run on translator changes
  const runChecks = useCallback(async () => {
    if (!features) return;

    setLoading(true);

    const resultRows: Row[] = await Promise.all(
      features.map(async (f): Promise<Row> => {
        try {
          if (f.key === "translator") {
            if (!translatorReady) {
              const note =
                !sourceLanguage || !targetLanguage
                  ? __(
                      "Select source and target language to check Translator.",
                      TEXT_DOMAIN,
                    )
                  : __(
                      "Source and target languages must be different.",
                      TEXT_DOMAIN,
                    );
              return { ...f, skipped: true, note };
            }

            const decision = await decide(f.key, {
              sourceLanguage: sourceLanguage!,
              targetLanguage: targetLanguage!,
            } as unknown as AnyCreateCoreOptions);

            return { ...f, decision };
          }

          if (f.key === "prompt") {
            const decision = await decide(
              f.key,
              PROMPT_MULTIMODAL_AVAILABILITY,
            );
            return { ...f, decision };
          }

          const decision = await decide(f.key);
          return { ...f, decision };
        } catch (e) {
          return { ...f, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    setRows(resultRows);
    setLoading(false);
  }, [decide, features, sourceLanguage, targetLanguage, translatorReady]);

  useEffect(() => {
    if (!features) return;
    queueMicrotask(() => void runChecks());
  }, [features, runChecks]);

  // Backend config box: show from the first decision that reports backendReason/availability
  const backendInfo = useMemo(() => {
    const d = rows
      .map((r) => r.decision)
      .find((x) => x?.backendReason || x?.backendAvailable !== undefined);

    return {
      backendAvailable: d?.backendAvailable,
      backendTransport: d?.backendTransport,
      backendApiName: d?.backendApiName,
      backendBaseUrl: d?.backendBaseUrl,
      backendReason: d?.backendReason ?? dash(),
    };
  }, [rows]);

  // Show Chrome config boxes only if decideCapability didn't browser-gate Prompt (Edge/Brave/Firefox/etc.)
  const summarizerAvailable = useMemo(() => {
    return rows.find((r) => r.key === "summarizer")?.decision
      ?.onDeviceAvailable;
  }, [rows]);

  const summarizerGateReason = useMemo(() => {
    if (summarizerAvailable === true) return undefined;
    return rows.find((r) => r.key === "summarizer")?.decision?.onDeviceReason;
  }, [rows, summarizerAvailable]);

  const showChromeConfigBoxes = useMemo(() => {
    if (summarizerAvailable === undefined) return undefined;
    if (summarizerAvailable === true) return true;
    return summarizerGateReason?.startsWith("browser-gate:ok");
  }, [summarizerAvailable, summarizerGateReason]);

  const requiredChromeForOnDevice = useMemo(() => {
    const values = rows.map((r) => r.minChrome).filter((n) => n > 0);
    return values.length > 0 ? Math.max(...values) : 0;
  }, [rows]);

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Title order={2} m={0}>
            {__("AI Diagnostics", TEXT_DOMAIN)}
          </Title>
          <Text c="dimmed" size="sm">
            {__(
              "This page helps you verify which AI capabilities are available on your current setup. It runs the same checks the plugin uses to decide whether to use on-device AI (in your browser) or fall back to the configured backend. Use it to troubleshoot missing features, validate browser requirements (e.g. Prompt multimodal for image metadata), and confirm your backend configuration.",
              TEXT_DOMAIN,
            )}{" "}
          </Text>
        </Box>

        <Box>
          <Code>decideCapability()</Code>
          <Badge variant="light">
            {loading ? __("Running…", TEXT_DOMAIN) : __("Done", TEXT_DOMAIN)}
          </Badge>
        </Box>
      </Group>

      <Paper withBorder p="md" radius="md">
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{__("Feature", TEXT_DOMAIN)}</Table.Th>
                <Table.Th>{__("Min Chrome", TEXT_DOMAIN)}</Table.Th>
                <Table.Th>{__("On-device", TEXT_DOMAIN)}</Table.Th>
                <Table.Th>{__("Status", TEXT_DOMAIN)}</Table.Th>
                <Table.Th>{__("Explanation", TEXT_DOMAIN)}</Table.Th>
                <Table.Th>{__("Error", TEXT_DOMAIN)}</Table.Th>
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {rows.map((r) => {
                const d = r.decision;

                return (
                  <Table.Tr key={r.key}>
                    <Table.Td>
                      <Stack gap={6}>
                        <Group gap="xs" wrap="nowrap">
                          <Code>{r.key}</Code>
                          {r.originTrial ? (
                            <Badge size="xs" variant="light">
                              *
                            </Badge>
                          ) : null}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {r.label}
                        </Text>

                        {r.key === "translator" ? (
                          <Group grow align="flex-end">
                            <Select
                              label={__("Source", TEXT_DOMAIN)}
                              placeholder={__("Select", TEXT_DOMAIN)}
                              data={languageOptions}
                              searchable
                              clearable
                              value={sourceLanguage}
                              onChange={(v) =>
                                setSourceLanguage(
                                  (v as AiKitLanguageCode) ?? null,
                                )
                              }
                            />
                            <Select
                              label={__("Target", TEXT_DOMAIN)}
                              placeholder={__("Select", TEXT_DOMAIN)}
                              data={languageOptions}
                              searchable
                              clearable
                              value={targetLanguage}
                              onChange={(v) =>
                                setTargetLanguage(
                                  (v as AiKitLanguageCode) ?? null,
                                )
                              }
                            />
                          </Group>
                        ) : null}

                        {r.skipped ? (
                          <Alert
                            icon={<IconAlertCircle size={16} />}
                            color="gray"
                            variant="light"
                            radius="md"
                            p="xs"
                          >
                            <Text size="xs">{r.note}</Text>
                          </Alert>
                        ) : null}
                      </Stack>
                    </Table.Td>

                    <Table.Td>
                      {r.minChrome > 0 ? (
                        <Badge variant="light">{r.minChrome}</Badge>
                      ) : (
                        <Text size="sm">{dash()}</Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      <AvailabilityIcon value={d?.onDeviceAvailable} />
                    </Table.Td>

                    <Table.Td>{statusBadge(d?.onDeviceStatus)}</Table.Td>

                    <Table.Td>
                      <Code>{explanationForRow(r)}</Code>
                    </Table.Td>

                    <Table.Td>
                      {r.error ? (
                        <Code c="red">{r.error}</Code>
                      ) : (
                        <Text size="sm">{dash()}</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Divider my="sm" />

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" wrap="wrap" mb={6}>
            <Title order={5} m={0}>
              {__("Backend configuration", TEXT_DOMAIN)}
            </Title>
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" c="dimmed">
                {__("Backend available:", TEXT_DOMAIN)}
              </Text>
              <AvailabilityIcon value={backendInfo.backendAvailable} />
            </Group>
          </Group>
          <Text size="sm" c="dimmed">
            <Code>
              {backendInfo.backendReason} (
              {backendInfo.backendTransport === "gatey" && (
                <>api: {backendInfo.backendApiName}</>
              )}
              {backendInfo.backendTransport === "fetch" && (
                <>base url: {backendInfo.backendBaseUrl}</>
              )}
              )
            </Code>
          </Text>
        </Paper>
      </Paper>

      {/* Chrome boxes: only if Prompt is not browser-gated; otherwise show Chrome download suggestion */}
      {showChromeConfigBoxes && (
        <>
          <Paper withBorder p="md" radius="md">
            <Title order={4} m={0}>
              {__("Origin Trial *", TEXT_DOMAIN)}
            </Title>

            <Text size="sm" c="dimmed" mt={6}>
              {__(
                "Some on-device features rely on experimental Chrome APIs. Origin Trial tokens are optional, but they let you enable these APIs for your domain/subdomains (on supported Chrome versions) without requiring visitors to turn on Chrome flags. Without Origin Trials, you can still use the same features — but you must enable the corresponding flags on every device/browser profile where you want them to work.",
                TEXT_DOMAIN,
              )}
            </Text>

            <Text size="sm" c="dimmed" mt={6}>
              {__(
                "To use Origin Trials, register tokens in Chrome and inject them into the page head. In WordPress, this means adding the token output to",
                TEXT_DOMAIN,
              )}{" "}
              <Code>wp_head</Code> {__("and", TEXT_DOMAIN)}{" "}
              <Code>admin_head</Code>
              {__(
                " so it’s present on both the frontend and in the admin UI. After changing tokens/flags, restart Chrome to make sure the browser picks up the new settings.",
                TEXT_DOMAIN,
              )}{" "}
              <a
                href="https://developer.chrome.com/origintrials/#/trials/active"
                target="_blank"
                rel="noreferrer"
              >
                {__("Register / manage Origin Trials", TEXT_DOMAIN)}
              </a>
            </Text>

            <Text size="sm" c="dimmed" mt={6}>
              {__(
                "Because these APIs are evolving, Google may change or retire them in future Chrome versions. We’ll track these changes and ship updates (or alternative fallbacks) in new AI-Kit releases when needed.",
                TEXT_DOMAIN,
              )}
            </Text>
            <Divider my="sm" />
            <Box>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 10,
                  overflowX: "auto",
                  background: "#0b0b0b",
                  color: "#f5f5f5",
                }}
              >
                {`define('ORIGIN_TRIAL_TOKEN_PROMPT_API', '...');
define('ORIGIN_TRIAL_TOKEN_PROOFREADER_API', '...');
define('ORIGIN_TRIAL_TOKEN_REWRITER_API', '...');
define('ORIGIN_TRIAL_TOKEN_WRITER_API', '...');

add_action('wp_head', 'add_origin_trial_headers', 1);
add_action('admin_head', 'add_origin_trial_headers', 1);
function add_origin_trial_headers() {
  echo '<meta http-equiv="origin-trial" content="' . esc_attr(ORIGIN_TRIAL_TOKEN_PROMPT_API) . '">' . "\\n";
  echo '<meta http-equiv="origin-trial" content="' . esc_attr(ORIGIN_TRIAL_TOKEN_PROOFREADER_API) . '">' . "\\n";
  echo '<meta http-equiv="origin-trial" content="' . esc_attr(ORIGIN_TRIAL_TOKEN_REWRITER_API) . '">' . "\\n";
  echo '<meta http-equiv="origin-trial" content="' . esc_attr(ORIGIN_TRIAL_TOKEN_WRITER_API) . '">' . "\\n";
}`}
              </pre>
            </Box>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Title order={4} m={0}>
              {__(
                "Chrome flags (copy & paste into the address bar)",
                TEXT_DOMAIN,
              )}
            </Title>

            <Text size="sm" c="dimmed" mt={6}>
              {__(
                "Chrome blocks clicking chrome:// links from pages, so use copy & paste. Flags are applied per Chrome installation/profile — enable them on every device/browser where you want to use these experimental on-device features, then restart Chrome.",
                TEXT_DOMAIN,
              )}{" "}
              <Code>chrome://flags</Code>
            </Text>

            <Text size="sm" c="dimmed" mt={6}>
              {__(
                "If a Chrome update changes these experimental APIs, some features may stop working until updated. Keep AI-Kit up to date so we can deliver fixes or fallbacks as the platform evolves.",
                TEXT_DOMAIN,
              )}
            </Text>

            <Divider my="sm" />

            <Stack gap={10}>
              <CopyableValue
                label={__("On-device model", TEXT_DOMAIN)}
                value={FLAG_ON_DEVICE_MODEL}
              />
              <CopyableValue
                label={__("Prompt API (Gemini Nano)", TEXT_DOMAIN)}
                value={FLAG_PROMPT_API}
              />
              <CopyableValue
                label={__("Prompt API (multimodal input)", TEXT_DOMAIN)}
                value={FLAG_PROMPT_MULTIMODAL}
              />
              <CopyableValue
                label={__("Writer API", TEXT_DOMAIN)}
                value={FLAG_WRITER}
              />
              <CopyableValue
                label={__("Rewriter API", TEXT_DOMAIN)}
                value={FLAG_REWRITER}
              />
              <CopyableValue
                label={__("Proofreader API", TEXT_DOMAIN)}
                value={FLAG_PROOFREADER}
              />
            </Stack>
          </Paper>
        </>
      )}
      {showChromeConfigBoxes === false && (
        <Paper withBorder p="md" radius="md">
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="yellow"
            radius="md"
          >
            <Stack gap={6}>
              <Text>
                {__(
                  "On-device AI features are not available in this browser. If you want to use on-device capabilities, please install a compatible Google Chrome version.",
                  TEXT_DOMAIN,
                )}
              </Text>

              {requiredChromeForOnDevice > 0 ? (
                <Text size="sm" c="dimmed">
                  {sprintf(
                    __("Recommended minimum Chrome version: %d", TEXT_DOMAIN),
                    requiredChromeForOnDevice,
                  )}
                </Text>
              ) : null}

              <Text size="sm">
                <a
                  href={"https://www.google.com/chrome/"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {__("Download Google Chrome", TEXT_DOMAIN)}
                </a>
              </Text>

              {summarizerGateReason ? (
                <Text size="sm" c="dimmed">
                  {__("Details:", TEXT_DOMAIN)}{" "}
                  <Code>{summarizerGateReason}</Code>
                </Text>
              ) : null}
            </Stack>
          </Alert>
        </Paper>
      )}
    </Stack>
  );
}

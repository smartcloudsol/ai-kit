import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconDeviceFloppy,
  IconLayersIntersect,
  IconRefresh,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import MonacoEditor from "../../components/MonacoEditor";
import {
  getMetadataConfig,
  updateExternalVocabularySources,
  updateMetadataConfig,
  type ExternalVocabularySource,
} from "./backend-client";
import {
  fetchKnowledgeSyncStatus,
  runKnowledgeSync,
} from "./api-client";

export default function MetadataLayersEditor() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["kb-metadata-config"],
    queryFn: getMetadataConfig,
  });
  const syncStatusQuery = useQuery({
    queryKey: ["knowledge-sync-status"],
    queryFn: fetchKnowledgeSyncStatus,
  });
  const [manualOverride, setManualOverride] = useState<string | null>(null);
  const [externalOverride, setExternalOverride] = useState<string | null>(null);
  const manualConfig =
    query.data?.layers?.manual.config ?? query.data?.config ?? "";
  const manual =
    manualOverride ??
    (typeof manualConfig === "string"
      ? manualConfig
      : JSON.stringify(manualConfig, null, 2));
  const external =
    externalOverride ??
    `${JSON.stringify(query.data?.layers?.external.sources ?? [], null, 2)}\n`;
  const legacyMigrationRequired =
    query.data?.layers?.manual.inheritedFromLegacy === true;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["kb-metadata-config"] }),
      queryClient.invalidateQueries({ queryKey: ["knowledge-sync-status"] }),
    ]);
  };

  const runSyncMutation = useMutation({
    mutationFn: runKnowledgeSync,
    onSuccess: async (result) => {
      const partialFailure = result.status === "partial-failure";
      notifications.show({
        title: partialFailure
          ? __("Knowledge Sync needs attention", TEXT_DOMAIN)
          : __("Knowledge Sync pass completed", TEXT_DOMAIN),
        message: partialFailure
          ? __(
              "The runner completed with one or more errors. Review Operational status.",
              TEXT_DOMAIN,
            )
          : __(
              "WordPress vocabulary and pending documents were reconciled.",
              TEXT_DOMAIN,
            ),
        color: partialFailure ? "red" : "green",
        icon: partialFailure ? (
          <IconAlertCircle size={16} />
        ) : (
          <IconCheck size={16} />
        ),
      });
      await refresh();
    },
    onError: (error: Error) =>
      notifications.show({
        title: __("Knowledge Sync pass failed", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      }),
  });

  const manualMutation = useMutation({
    mutationFn: () =>
      updateMetadataConfig({ raw: manual }, query.data?.layers?.manual.eTag),
    onSuccess: async (result) => {
      notifications.show({
        title: __("Manual metadata policy saved", TEXT_DOMAIN),
        message: result.materialized
          ? __(
              "The effective metadata config was materialized.",
              TEXT_DOMAIN,
            )
          : __(
              "The metadata input was staged without changing the effective configuration.",
              TEXT_DOMAIN,
            ),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      setManualOverride(null);
      await refresh();
    },
    onError: (error: Error) =>
      notifications.show({
        title: __("Metadata policy was not saved", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      }),
  });

  const externalMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(external) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("External vocabulary sources must be a JSON array.");
      }
      return updateExternalVocabularySources(
        parsed as ExternalVocabularySource[],
        query.data?.layers?.external.eTag,
      );
    },
    onSuccess: async (result) => {
      notifications.show({
        title: __("External vocabularies saved", TEXT_DOMAIN),
        message: result.materialized
          ? __(
              "The effective metadata config was materialized.",
              TEXT_DOMAIN,
            )
          : __(
              "The external vocabulary was staged. Review the proposed result and establish the manual layer when you are ready to activate it.",
              TEXT_DOMAIN,
            ),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      setExternalOverride(null);
      await refresh();
    },
    onError: (error: Error) =>
      notifications.show({
        title: __("External vocabularies were not saved", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      }),
  });

  if (query.isLoading) {
    return (
      <Card withBorder shadow="sm">
        <Group>
          <Loader size="sm" />
          <Text>{__("Loading metadata layers...", TEXT_DOMAIN)}</Text>
        </Group>
      </Card>
    );
  }
  if (query.error || !query.data) {
    return (
      <Alert color="red">
        {query.error?.message ??
          __("Metadata layers are unavailable.", TEXT_DOMAIN)}
      </Alert>
    );
  }

  const wordpressSources = query.data.layers?.wordpress.sources ?? [];
  const activeVocabularyPolicies = Object.values(
    syncStatusQuery.data?.policies ?? {},
  ).filter(
    (policy) =>
      policy.enabled &&
      policy.reviewPolicy !== "disabled" &&
      policy.includeTaxonomies.length > 0,
  );
  const layeredMetadataAvailable = query.data.layers !== undefined;
  const effective =
    query.data.effectiveConfig ??
    (typeof query.data.config === "string"
      ? query.data.config
      : JSON.stringify(query.data.config, null, 2));
  const proposed = query.data.proposedConfig ?? effective;

  return (
    <Card withBorder shadow="sm">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>
              <Group gap="xs">
                <IconLayersIntersect size={20} />
                {__("Metadata configuration layers", TEXT_DOMAIN)}
              </Group>
            </Title>
            <Text size="sm" c="dimmed">
              {__(
                "The authored policy and merge rules are combined with enabled external and WordPress vocabularies into one generated effective config.",
                TEXT_DOMAIN,
              )}
            </Text>
          </div>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={refresh}
          >
            {__("Refresh", TEXT_DOMAIN)}
          </Button>
        </Group>

        {query.data.layers?.manual.inheritedFromLegacy && (
          <Alert
            color="blue"
            title={__("Legacy config ready to migrate", TEXT_DOMAIN)}
          >
            {query.data.pendingActivation
              ? __(
                  "External or WordPress inputs are staged, but the current effective metadata-config.yaml remains unchanged. Review Proposed result, then establish the manual layer only when you are ready to activate the staged merge.",
                  TEXT_DOMAIN,
                )
              : __(
                  "A proposed manual policy is shown read-only. It preserves unknown and manually owned fields while leaving vocabulary supplied by External and WordPress-derived layers under producer control. Establish it before editing the manual layer.",
                  TEXT_DOMAIN,
                )}
          </Alert>
        )}

        {!layeredMetadataAvailable && (
          <Alert
            color="yellow"
            title={__("Backend update required", TEXT_DOMAIN)}
          >
            {__(
              "This backend exposes only the legacy metadata editor contract. Deploy a backend that advertises Knowledge Automation v2 before editing separate layers.",
              TEXT_DOMAIN,
            )}
          </Alert>
        )}

        <Alert color="blue" title={__("What should I configure?", TEXT_DOMAIN)}>
          <Stack gap={4}>
            <Text size="sm">
              {__(
                "Manual policy is the stable authored base and conflict policy, not an editable copy of the generated merge. Use allowedCategories, allowedTags, and namespaceTags for values you always want to keep; use vocabularyPolicy for aliases, exclusions, and locked display values.",
                TEXT_DOMAIN,
              )}
            </Text>
            <Text size="sm">
              {__(
                "External vocabularies and WordPress-derived use JSON because they are structured producer envelopes with source IDs, enabled state, and namespaces. External is editable; WordPress-derived is replaced by the signed runner and is read-only.",
                TEXT_DOMAIN,
              )}
            </Text>
            <Text size="sm">
              {__(
                "Effective result is the last-known-valid YAML consumed by retrieval after all layers and merge rules are applied. Provenance is a read-only JSON audit map from each effective value to the source layer(s) that contributed it.",
                TEXT_DOMAIN,
              )}
            </Text>
          </Stack>
        </Alert>

        <Tabs defaultValue="manual">
          <Tabs.List>
            <Tabs.Tab value="manual">
              <Group gap={6}>
                {__("Manual policy", TEXT_DOMAIN)}{" "}
                <Badge size="xs" variant="light">
                  YAML
                </Badge>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="external">
              <Group gap={6}>
                {__("External vocabularies", TEXT_DOMAIN)}{" "}
                <Badge size="xs" variant="light">
                  JSON
                </Badge>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="wordpress">
              <Group gap={6}>
                {__("WordPress-derived", TEXT_DOMAIN)}{" "}
                <Badge size="xs">{wordpressSources.length}</Badge>{" "}
                <Badge size="xs" variant="light">
                  JSON
                </Badge>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="effective">
              <Group gap={6}>
                {__("Effective result", TEXT_DOMAIN)}{" "}
                <Badge size="xs" variant="light">
                  YAML
                </Badge>
              </Group>
            </Tabs.Tab>
            {legacyMigrationRequired && (
              <Tabs.Tab value="proposed">
                <Group gap={6}>
                  {__("Proposed result", TEXT_DOMAIN)}{" "}
                  <Badge size="xs" variant="light" color="yellow">
                    YAML
                  </Badge>
                </Group>
              </Tabs.Tab>
            )}
            <Tabs.Tab value="provenance">
              <Group gap={6}>
                {__("Provenance", TEXT_DOMAIN)}{" "}
                <Badge size="xs" variant="light">
                  JSON
                </Badge>
              </Group>
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="manual" pt="md">
            <Stack gap="sm">
              <Text size="sm">
                {__(
                  "Editable YAML. Preserve any existing backend policy fields. The three primary vocabulary keys are allowedCategories, allowedTags, and namespaceTags; namespaceTags must also appear in allowedTags.",
                  TEXT_DOMAIN,
                )}
              </Text>
              <Alert
                color="gray"
                title={__("Optional merge controls", TEXT_DOMAIN)}
              >
                <Text size="sm" mb="xs">
                  {__(
                    "Use vocabularyPolicy only when automatic sources need normalization. Aliases combine alternate terms, exclusions suppress automatic terms, and lockedValues choose the exact displayed value when layers use different spelling.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <Text
                  component="pre"
                  size="xs"
                  style={{ whiteSpace: "pre-wrap", margin: 0 }}
                >
                  {`vocabularyPolicy:
  schemaVersion: 1
  aliases:
    post_tag:
      ai-kit-plugin: ai-kit
  exclusions:
    category:
      - uncategorized
  lockedValues:
    post_tag:
      ai-kit: AI-Kit`}
                </Text>
              </Alert>
              <MonacoEditor
                value={manual}
                onChange={(value) => setManualOverride(value ?? "")}
                language="yaml"
                height="520px"
                theme="vs-light"
                minimap={false}
                wordWrap="on"
                readOnly={!layeredMetadataAvailable || legacyMigrationRequired}
              />
              <Group justify="flex-end">
                <Button
                  disabled={!layeredMetadataAvailable}
                  leftSection={<IconDeviceFloppy size={16} />}
                  loading={manualMutation.isPending}
                  onClick={() => {
                    if (
                      legacyMigrationRequired &&
                      query.data.pendingActivation &&
                      !window.confirm(
                          __(
                          "Establishing the manual layer will preserve manual-only policy fields and activate the staged external and WordPress vocabularies shown under Proposed result. Continue?",
                          TEXT_DOMAIN,
                        ),
                      )
                    ) {
                      return;
                    }
                    manualMutation.mutate();
                  }}
                >
                  {legacyMigrationRequired
                    ? __("Establish manual layer", TEXT_DOMAIN)
                    : __("Save manual policy", TEXT_DOMAIN)}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="external" pt="md">
            <Stack gap="sm">
              <Text size="sm">
                {__(
                  "Editable JSON array. Each item needs a stable id, an enabled flag, and a namespaces object whose values are arrays. Leave this empty when no external producer vocabulary is required.",
                  TEXT_DOMAIN,
                )}
              </Text>
              <Alert
                color="gray"
                title={__("Expected JSON shape", TEXT_DOMAIN)}
              >
                <Text
                  component="pre"
                  size="xs"
                  style={{ whiteSpace: "pre-wrap", margin: 0 }}
                >
                  {`[
  {
    "id": "docusaurus",
    "enabled": true,
    "namespaces": {
      "category": [
        { "slug": "guides", "label": "Guides" },
        { "slug": "setup", "label": "Setup", "parentSlug": "guides" }
      ],
      "post_tag": ["ai-kit"]
    }
  }
]`}
                </Text>
              </Alert>
              <MonacoEditor
                value={external}
                onChange={(value) => setExternalOverride(value ?? "[]")}
                language="json"
                height="520px"
                theme="vs-light"
                minimap={false}
                wordWrap="on"
                readOnly={!layeredMetadataAvailable}
              />
              <Group justify="flex-end">
                <Button
                  disabled={!layeredMetadataAvailable}
                  leftSection={<IconDeviceFloppy size={16} />}
                  loading={externalMutation.isPending}
                  onClick={() => externalMutation.mutate()}
                >
                  {__("Save external vocabularies", TEXT_DOMAIN)}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="wordpress" pt="md">
            <Stack gap="sm">
              <Alert color="gray">
                {__(
                  "This layer is machine-owned. Configure synchronized post types and taxonomies under Automatic Knowledge Sync.",
                  TEXT_DOMAIN,
                )}
              </Alert>
              {wordpressSources.length === 0 && (
                <Alert
                  color="yellow"
                  title={__(
                    "No WordPress vocabulary has been materialized",
                    TEXT_DOMAIN,
                  )}
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      {activeVocabularyPolicies.length === 0
                        ? __(
                            "Selecting taxonomies is not enough by itself. Enable automatic synchronization for at least one content type, save its policy, then run a sync pass or wait for cron.",
                            TEXT_DOMAIN,
                          )
                        : syncStatusQuery.data?.vocabulary
                          ? __(
                              "WordPress accepted a vocabulary version locally, but the backend has not returned a derived source yet. Run another pass after enrollment and refresh this panel.",
                              TEXT_DOMAIN,
                            )
                          : __(
                              "An enabled policy is ready, but no vocabulary version has been accepted yet. Run a sync pass or wait for cron.",
                              TEXT_DOMAIN,
                            )}
                    </Text>
                    {activeVocabularyPolicies.length > 0 && (
                      <Group justify="flex-end">
                        <Button
                          size="xs"
                          variant="light"
                          loading={runSyncMutation.isPending}
                          onClick={() => runSyncMutation.mutate()}
                        >
                          {__("Run one sync pass", TEXT_DOMAIN)}
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </Alert>
              )}
              <MonacoEditor
                value={`${JSON.stringify(wordpressSources, null, 2)}\n`}
                language="json"
                height="520px"
                theme="vs-light"
                minimap={false}
                wordWrap="on"
                readOnly
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="effective" pt="md">
            <Stack gap="sm">
              <Alert color="green">
                {__(
                  "Read-only last-known-valid result consumed by Knowledge Base retrieval.",
                  TEXT_DOMAIN,
                )}
              </Alert>
              <MonacoEditor
                value={effective}
                language="yaml"
                height="520px"
                theme="vs-light"
                minimap={false}
                wordWrap="on"
                readOnly
              />
            </Stack>
          </Tabs.Panel>

          {legacyMigrationRequired && (
            <Tabs.Panel value="proposed" pt="md">
              <Stack gap="sm">
                <Alert color="yellow">
                  {__(
                    "Read-only preview. This does not become the live metadata configuration until you establish the manual layer.",
                    TEXT_DOMAIN,
                  )}
                </Alert>
                <MonacoEditor
                  value={proposed}
                  language="yaml"
                  height="520px"
                  theme="vs-light"
                  minimap={false}
                  wordWrap="on"
                  readOnly
                />
              </Stack>
            </Tabs.Panel>
          )}

          <Tabs.Panel value="provenance" pt="md">
            <Stack gap="sm">
              {(query.data.collisions?.length ?? 0) > 0 && (
                <Alert
                  color="yellow"
                  title={__("Display-name collisions resolved", TEXT_DOMAIN)}
                >
                  <Text size="sm">
                    {__(
                      "Terms with the same canonical identity used different spelling. The selected values are shown below; add lockedValues in Manual policy to override them explicitly.",
                      TEXT_DOMAIN,
                    )}
                  </Text>
                  <Text
                    component="pre"
                    size="xs"
                    mt="xs"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {JSON.stringify(query.data.collisions, null, 2)}
                  </Text>
                </Alert>
              )}
              <MonacoEditor
                value={`${JSON.stringify(
                  query.data.provenance ?? {},
                  null,
                  2,
                )}\n`}
                language="json"
                height="520px"
                theme="vs-light"
                minimap={false}
                wordWrap="on"
                readOnly
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Card>
  );
}

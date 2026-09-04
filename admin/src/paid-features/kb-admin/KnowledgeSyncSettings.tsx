import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconKey,
  IconRefresh,
  IconRotate,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useEffect, useMemo, useRef, useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import {
  approveKnowledgeSyncManualReview,
  approveKnowledgeSyncMassDeletion,
  enrollKnowledgeSyncTransport,
  fetchKnowledgeSyncStatus,
  fetchKnowledgeSyncTransportStatus,
  rotateKnowledgeSyncTransport,
  revokeKnowledgeSyncTransport,
  runKnowledgeSync,
  updateKnowledgeSyncPolicy,
  updateKnowledgeSyncSettings,
  verifyKnowledgeSyncTransport,
} from "./api-client";
import { createKnowledgeSyncPairingCode } from "./backend-client";
import type {
  KnowledgeSyncPolicy,
  KnowledgeSyncSettings as KnowledgeSyncSettingsValue,
} from "./types";

interface KnowledgeSyncSettingsProps {
  accountId: string;
  siteId: string;
  configuredBackendBaseUrl: string;
}

const defaultPolicy = (postType: string): KnowledgeSyncPolicy => ({
  schemaVersion: 1,
  postType,
  enabled: false,
  autoEnableSource: "administrator",
  reviewPolicy: "disabled",
  onPublish: "upsert",
  onPublishedUpdate: "upsert",
  onUnpublish: "delete",
  metadataRefresh: "reconcile",
  includeTaxonomies: [],
  documentProfile: "default",
});

function showError(error: Error): void {
  notifications.show({
    title: __("Knowledge Sync error", TEXT_DOMAIN),
    message: error.message,
    color: "red",
    icon: <IconAlertCircle size={16} />,
  });
}

export default function KnowledgeSyncSettings({
  accountId,
  siteId,
  configuredBackendBaseUrl,
}: KnowledgeSyncSettingsProps) {
  const statusQuery = useQuery({
    queryKey: ["knowledge-sync-status"],
    queryFn: fetchKnowledgeSyncStatus,
  });
  const transportQuery = useQuery({
    queryKey: ["knowledge-sync-transport"],
    queryFn: fetchKnowledgeSyncTransportStatus,
  });
  const [settingsOverride, setSettingsOverride] =
    useState<KnowledgeSyncSettingsValue | null>(null);
  const [selectedPostType, setSelectedPostType] = useState<string | null>(null);
  const [policyOverride, setPolicyOverride] = useState<{
    postType: string;
    value: KnowledgeSyncPolicy;
  } | null>(null);
  const lastBackendSnapshotAttempt = useRef<string | null>(null);
  const storedSettings = statusQuery.data?.settings ?? null;
  const settings =
    settingsOverride ??
    (storedSettings
      ? { ...storedSettings, backendBaseUrl: configuredBackendBaseUrl }
      : storedSettings);
  const effectivePostType =
    selectedPostType ?? statusQuery.data?.availablePostTypes[0]?.value ?? null;
  const policy = effectivePostType
    ? policyOverride?.postType === effectivePostType
      ? policyOverride.value
      : statusQuery.data?.policies[effectivePostType] ??
        defaultPolicy(effectivePostType)
    : null;

  const selectedPostTypeDefinition = useMemo(
    () =>
      statusQuery.data?.availablePostTypes.find(
        (item) => item.value === effectivePostType,
      ),
    [effectivePostType, statusQuery.data],
  );
  const automationVersion =
    transportQuery.data?.backendCompatibility.capabilities?.[
      "knowledge.automation"
    ] ?? 0;

  const refresh = async () => {
    await Promise.all([statusQuery.refetch(), transportQuery.refetch()]);
  };

  const settingsMutation = useMutation({
    mutationFn: (value: KnowledgeSyncSettingsValue) =>
      updateKnowledgeSyncSettings({
        ...value,
        backendBaseUrl: configuredBackendBaseUrl,
      }),
    onSuccess: async () => {
      notifications.show({
        title: __("Knowledge Sync settings saved", TEXT_DOMAIN),
        message: __("The local sync settings were updated.", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      setSettingsOverride(null);
      await refresh();
    },
    onError: showError,
  });

  const backendSnapshotMutation = useMutation({
    mutationFn: (value: KnowledgeSyncSettingsValue) =>
      updateKnowledgeSyncSettings({
        ...value,
        backendBaseUrl: configuredBackendBaseUrl,
      }),
    onSuccess: async () => {
      await refresh();
    },
  });
  const syncBackendSnapshot = backendSnapshotMutation.mutate;

  useEffect(() => {
    if (
      !storedSettings ||
      !configuredBackendBaseUrl ||
      storedSettings.backendBaseUrl === configuredBackendBaseUrl ||
      backendSnapshotMutation.isPending ||
      lastBackendSnapshotAttempt.current === configuredBackendBaseUrl
    ) {
      return;
    }
    lastBackendSnapshotAttempt.current = configuredBackendBaseUrl;
    syncBackendSnapshot(storedSettings);
  }, [
    backendSnapshotMutation.isPending,
    configuredBackendBaseUrl,
    syncBackendSnapshot,
    storedSettings,
  ]);

  const policyMutation = useMutation({
    mutationFn: ({
      postType,
      value,
    }: {
      postType: string;
      value: KnowledgeSyncPolicy;
    }) => updateKnowledgeSyncPolicy(postType, value),
    onSuccess: async () => {
      notifications.show({
        title: __("Content policy saved", TEXT_DOMAIN),
        message: __(
          "The initial baseline will be reconciled by the runner.",
          TEXT_DOMAIN,
        ),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      setPolicyOverride(null);
      await refresh();
    },
    onError: showError,
  });

  const createAndEnrollMutation = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error("Knowledge Sync settings are not loaded.");
      if (!configuredBackendBaseUrl) {
        throw new Error(
          "The AI Kit backend could not be resolved from API Settings.",
        );
      }
      if (!accountId || !siteId) {
        throw new Error("Connect this WordPress site before enrollment.");
      }
      await updateKnowledgeSyncSettings({
        ...settings,
        backendBaseUrl: configuredBackendBaseUrl,
      });
      const pairing = await createKnowledgeSyncPairingCode(
        accountId,
        siteId,
        settings.environment,
      );
      return enrollKnowledgeSyncTransport(pairing.pairingCode);
    },
    onSuccess: async () => {
      notifications.show({
        title: __("Site enrolled", TEXT_DOMAIN),
        message: __("Signed Knowledge Sync transport is ready.", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      await refresh();
    },
    onError: showError,
  });

  const operationMutation = useMutation({
    mutationFn: async (operation: "verify" | "rotate" | "revoke" | "run") => {
      if (operation === "verify") return verifyKnowledgeSyncTransport();
      if (operation === "rotate") return rotateKnowledgeSyncTransport();
      if (operation === "revoke") return revokeKnowledgeSyncTransport();
      return runKnowledgeSync();
    },
    onSuccess: async (result, operation) => {
      const runStatus =
        typeof result.status === "string" ? result.status : "success";
      notifications.show({
        title:
          runStatus === "partial-failure"
            ? __("Knowledge Sync needs attention", TEXT_DOMAIN)
            : __("Knowledge Sync operation completed", TEXT_DOMAIN),
        message:
          operation === "run"
            ? runStatus === "partial-failure"
              ? __(
                  "The runner completed with one or more errors. Review Operational status.",
                  TEXT_DOMAIN,
                )
              : __("The local runner completed this pass.", TEXT_DOMAIN)
            : __("The signed site connection was updated.", TEXT_DOMAIN),
        color: runStatus === "partial-failure" ? "red" : "green",
        icon:
          runStatus === "partial-failure" ? (
            <IconAlertCircle size={16} />
          ) : (
            <IconCheck size={16} />
          ),
      });
      await refresh();
    },
    onError: showError,
  });

  const approveManualReviewMutation = useMutation({
    mutationFn: () =>
      approveKnowledgeSyncManualReview(effectivePostType ?? undefined),
    onSuccess: async ({ approved }) => {
      notifications.show({
        title: __("Manual review approved", TEXT_DOMAIN),
        message: `${approved} ${__(
          "blocked change(s) were released for delivery.",
          TEXT_DOMAIN,
        )}`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
      await refresh();
    },
    onError: showError,
  });

  const approveMassDeletionMutation = useMutation({
    mutationFn: () => approveKnowledgeSyncMassDeletion(),
    onSuccess: async ({ approved }) => {
      notifications.show({
        title: __("Mass deletion approved", TEXT_DOMAIN),
        message: `${approved} ${__(
          "current tombstone(s) were released for delivery.",
          TEXT_DOMAIN,
        )}`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
      await refresh();
    },
    onError: showError,
  });

  if (statusQuery.error || transportQuery.error) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {(statusQuery.error ?? transportQuery.error)?.message}
      </Alert>
    );
  }

  if (!settings || statusQuery.isLoading || transportQuery.isLoading) {
    return (
      <Text c="dimmed">{__("Loading Knowledge Sync...", TEXT_DOMAIN)}</Text>
    );
  }

  const transport = transportQuery.data;
  const backendVerified =
    transport?.backendCompatibility.status === "verified" &&
    automationVersion >= 1;
  const contentDeliveryAvailable = automationVersion >= 4;
  const backendSnapshotPending = Boolean(
    configuredBackendBaseUrl &&
      storedSettings?.backendBaseUrl !== configuredBackendBaseUrl,
  );
  const hasPendingWork = Object.entries(statusQuery.data?.outbox ?? {}).some(
    ([state, count]) => state !== "complete" && count > 0,
  );
  const ingestion = transport?.remoteStatus?.ingestion;
  const manifest = transport?.remoteStatus?.manifest;
  const remoteMissingCount = manifest?.counts?.["remote-missing"] ?? 0;
  const hashMismatchCount = manifest?.counts?.["hash-mismatch"] ?? 0;
  const massDeleteReviewCount =
    statusQuery.data?.blockedReasons?.mass_delete_review_required ?? 0;
  const manualReviewCount =
    statusQuery.data?.blockedReasons?.manual_review_required ?? 0;
  const otherBlockedCount = Math.max(
    0,
    (statusQuery.data?.outbox.blocked ?? 0) -
      massDeleteReviewCount -
      manualReviewCount,
  );

  return (
    <Card withBorder shadow="sm">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>
              {__("Automatic Knowledge Sync", TEXT_DOMAIN)}
            </Title>
            <Text size="sm" c="dimmed">
              {__(
                "Capture approved public WordPress changes locally, deliver them through signed transport, and reconcile the Knowledge Base without manual document publishing.",
                TEXT_DOMAIN,
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Badge color={transport?.enrolled ? "green" : "gray"}>
              {transport?.enrolled
                ? __("Enrolled", TEXT_DOMAIN)
                : __("Not enrolled", TEXT_DOMAIN)}
            </Badge>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={refresh}
            >
              {__("Refresh", TEXT_DOMAIN)}
            </Button>
          </Group>
        </Group>

        {!contentDeliveryAvailable && (
          <Alert
            color="yellow"
            title={__(
              backendSnapshotPending
                ? "Synchronizing backend settings"
                : "Backend update required",
              TEXT_DOMAIN,
            )}
          >
            {backendSnapshotPending
              ? __(
                  "The backend selected in API Settings is being mirrored for scheduled server-side Knowledge Sync.",
                  TEXT_DOMAIN,
                )
              : backendVerified
              ? __(
                  "This backend supports signed enrollment but does not yet advertise versioned content delivery. Settings may be prepared safely; automatic delivery remains disabled.",
                  TEXT_DOMAIN,
                )
              : __(
                  "Configure a compatible AI Kit backend before enabling automatic delivery.",
                  TEXT_DOMAIN,
                )}
          </Alert>
        )}

        <Accordion variant="contained" defaultValue="connection">
          <Accordion.Item value="connection">
            <Accordion.Control>
              {__("Connection and runner", TEXT_DOMAIN)}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Alert color="blue">
                  {__(
                    "Knowledge Sync registers a WordPress cron event every five minutes. On low-traffic or disabled-WP-Cron sites, run due WordPress cron events from the system scheduler at the same cadence; the runner lock prevents overlapping passes.",
                    TEXT_DOMAIN,
                  )}
                </Alert>
                <Alert color={configuredBackendBaseUrl ? "blue" : "red"}>
                  <Text size="sm" fw={600}>
                    {__("Backend from API Settings", TEXT_DOMAIN)}
                  </Text>
                  <Text size="sm">
                    {configuredBackendBaseUrl ||
                      __(
                        "No backend URL could be resolved. Configure the AI Kit API first.",
                        TEXT_DOMAIN,
                      )}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {__(
                      "This value is read-only. Gatey API names are resolved to their configured endpoint and mirrored automatically so WordPress cron can use the same backend.",
                      TEXT_DOMAIN,
                    )}
                  </Text>
                </Alert>
                {backendSnapshotMutation.error && (
                  <Alert color="red" icon={<IconAlertCircle size={16} />}>
                    {backendSnapshotMutation.error.message}
                  </Alert>
                )}
                <Group grow align="flex-start">
                  <Select
                    label={__("Environment", TEXT_DOMAIN)}
                    data={[
                      { value: "dev", label: __("Development", TEXT_DOMAIN) },
                      { value: "staging", label: __("Staging", TEXT_DOMAIN) },
                      { value: "prod", label: __("Production", TEXT_DOMAIN) },
                    ]}
                    value={settings.environment}
                    onChange={(value) =>
                      value &&
                      setSettingsOverride({
                        ...settings,
                        environment:
                          value as KnowledgeSyncSettingsValue["environment"],
                      })
                    }
                  />
                  <Select
                    label={__("Private-key storage", TEXT_DOMAIN)}
                    data={[
                      { value: "disabled", label: __("Disabled", TEXT_DOMAIN) },
                      {
                        value: "encrypted-option",
                        label: __("Encrypted WordPress option", TEXT_DOMAIN),
                      },
                      {
                        value: "file",
                        label: __(
                          "Protected file outside webroot",
                          TEXT_DOMAIN,
                        ),
                      },
                    ]}
                    value={settings.keyStorageMode}
                    onChange={(value) =>
                      value &&
                      setSettingsOverride({
                        ...settings,
                        keyStorageMode:
                          value as KnowledgeSyncSettingsValue["keyStorageMode"],
                      })
                    }
                  />
                </Group>
                <Group grow align="flex-start">
                  <NumberInput
                    label={__("Baseline page size", TEXT_DOMAIN)}
                    min={10}
                    max={200}
                    value={settings.baselinePageSize}
                    onChange={(value) =>
                      setSettingsOverride({
                        ...settings,
                        baselinePageSize: Number(value),
                      })
                    }
                  />
                  <NumberInput
                    label={__("Transport batch size", TEXT_DOMAIN)}
                    min={1}
                    max={100}
                    value={settings.transportBatchSize}
                    onChange={(value) =>
                      setSettingsOverride({
                        ...settings,
                        transportBatchSize: Number(value),
                      })
                    }
                  />
                </Group>
                {statusQuery.data?.multisite.enabled ? (
                  <Switch
                    label={__("Include multisite subsites", TEXT_DOMAIN)}
                    description={__(
                      "Follow eligible policies on every site in this network.",
                      TEXT_DOMAIN,
                    )}
                    checked={settings.includeSubsites}
                    disabled={!statusQuery.data.multisite.canIncludeSubsites}
                    onChange={(event) =>
                      setSettingsOverride({
                        ...settings,
                        includeSubsites: event.currentTarget.checked,
                      })
                    }
                    styles={{
                      root: {
                        cursor: statusQuery.data.multisite.canIncludeSubsites
                          ? "pointer"
                          : "not-allowed",
                      },
                      label: {
                        cursor: statusQuery.data.multisite.canIncludeSubsites
                          ? "pointer"
                          : "not-allowed",
                      },
                      track: {
                        cursor: statusQuery.data.multisite.canIncludeSubsites
                          ? "pointer"
                          : "not-allowed",
                      },
                    }}
                  />
                ) : statusQuery.data ? (
                  <Text size="sm" c="dimmed">
                    {__(
                      "This WordPress installation is not a multisite network.",
                      TEXT_DOMAIN,
                    )}
                  </Text>
                ) : null}
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    {transport?.backendCompatibility.status === "verified"
                      ? `Backend ${
                          transport.backendCompatibility.release ?? ""
                        }; API schema ${
                          transport.backendCompatibility.apiSchemaVersion ?? "?"
                        }`
                      : transport?.backendCompatibility.reason ??
                        __("Backend not verified", TEXT_DOMAIN)}
                  </Text>
                  <Button
                    loading={settingsMutation.isPending}
                    disabled={!configuredBackendBaseUrl}
                    onClick={() => settingsMutation.mutate(settings)}
                  >
                    {__("Save connection settings", TEXT_DOMAIN)}
                  </Button>
                </Group>
                <Divider />
                <Group>
                  {!transport?.enrolled ? (
                    <Button
                      leftSection={<IconKey size={16} />}
                      disabled={
                        !backendVerified ||
                        settings.keyStorageMode === "disabled"
                      }
                      loading={createAndEnrollMutation.isPending}
                      onClick={() => createAndEnrollMutation.mutate()}
                    >
                      {__("Create pairing code and enroll", TEXT_DOMAIN)}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="light"
                        onClick={() => operationMutation.mutate("verify")}
                      >
                        {__("Verify connection", TEXT_DOMAIN)}
                      </Button>
                      <Button
                        variant="light"
                        leftSection={<IconRotate size={16} />}
                        onClick={() => operationMutation.mutate("rotate")}
                      >
                        {__("Rotate site key", TEXT_DOMAIN)}
                      </Button>
                      <Button
                        color="red"
                        variant="light"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (
                            window.confirm(
                              __(
                                "Revoke this site's Knowledge Sync key? Scheduled delivery will stop until the site is enrolled again.",
                                TEXT_DOMAIN,
                              ),
                            )
                          ) {
                            operationMutation.mutate("revoke");
                          }
                        }}
                      >
                        {__("Revoke site key", TEXT_DOMAIN)}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    disabled={!transport?.enrolled || !contentDeliveryAvailable}
                    loading={operationMutation.isPending}
                    onClick={() => operationMutation.mutate("run")}
                  >
                    {__("Run one sync pass", TEXT_DOMAIN)}
                  </Button>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="content-policy">
            <Accordion.Control>
              {__("Content policy", TEXT_DOMAIN)}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Select
                  label={__("Public content type", TEXT_DOMAIN)}
                  data={statusQuery.data?.availablePostTypes ?? []}
                  value={effectivePostType}
                  onChange={(value) => {
                    setSelectedPostType(value);
                    setPolicyOverride(null);
                  }}
                />
                {policy && effectivePostType && (
                  <>
                    <Switch
                      label={__(
                        "Automatically synchronize this content type",
                        TEXT_DOMAIN,
                      )}
                      checked={policy.enabled}
                      disabled={!contentDeliveryAvailable}
                      onChange={(event) =>
                        setPolicyOverride({
                          postType: effectivePostType,
                          value: {
                            ...policy,
                            enabled: event.currentTarget.checked,
                            reviewPolicy: event.currentTarget.checked
                              ? "wordpress-publish-is-approval"
                              : "disabled",
                          },
                        })
                      }
                      styles={{
                        root: {
                          cursor: contentDeliveryAvailable
                            ? "pointer"
                            : "not-allowed",
                        },
                        label: {
                          cursor: contentDeliveryAvailable
                            ? "pointer"
                            : "not-allowed",
                        },
                        track: {
                          cursor: contentDeliveryAvailable
                            ? "pointer"
                            : "not-allowed",
                        },
                      }}
                    />
                    <Select
                      label={__("Approval policy", TEXT_DOMAIN)}
                      data={[
                        {
                          value: "disabled",
                          label: __("Disabled", TEXT_DOMAIN),
                        },
                        {
                          value: "wordpress-publish-is-approval",
                          label: __(
                            "WordPress publish is approval",
                            TEXT_DOMAIN,
                          ),
                        },
                        {
                          value: "manual-kb-review",
                          label: __("Require manual KB review", TEXT_DOMAIN),
                        },
                      ]}
                      value={policy.reviewPolicy}
                      onChange={(value) =>
                        value &&
                        setPolicyOverride({
                          postType: effectivePostType,
                          value: {
                            ...policy,
                            reviewPolicy:
                              value as KnowledgeSyncPolicy["reviewPolicy"],
                          },
                        })
                      }
                    />
                    <MultiSelect
                      label={__("Taxonomies included in metadata", TEXT_DOMAIN)}
                      description={__(
                        "Terms are published to WordPress-derived only while this content type is enabled. Save the policy, then run a sync pass (or wait for cron).",
                        TEXT_DOMAIN,
                      )}
                      data={selectedPostTypeDefinition?.taxonomies ?? []}
                      value={policy.includeTaxonomies}
                      onChange={(value) =>
                        setPolicyOverride({
                          postType: effectivePostType,
                          value: { ...policy, includeTaxonomies: value },
                        })
                      }
                      searchable
                      clearable
                    />
                    {!policy.enabled && policy.includeTaxonomies.length > 0 && (
                      <Alert color="yellow">
                        {__(
                          "These taxonomy selections are currently dormant because automatic synchronization is off for this content type.",
                          TEXT_DOMAIN,
                        )}
                      </Alert>
                    )}
                    <Alert color="blue">
                      {policy.enabled
                        ? __(
                            "After each signed automatic document is accepted, any superseded browser-published document for the same WordPress post is retired. Disabling this content type queues removal of its automatic documents.",
                            TEXT_DOMAIN,
                          )
                        : __(
                            "Enabling automatic synchronization replaces existing browser-published copies only after their signed automatic replacements are accepted.",
                            TEXT_DOMAIN,
                          )}
                    </Alert>
                    <TextInput
                      label={__("Document profile", TEXT_DOMAIN)}
                      description={__(
                        "Advanced routing label stored with the backend document metadata. It does not change conversion or ingestion by itself; keep default unless retrieval filters explicitly use another profile.",
                        TEXT_DOMAIN,
                      )}
                      value={policy.documentProfile}
                      onChange={(event) =>
                        setPolicyOverride({
                          postType: effectivePostType,
                          value: {
                            ...policy,
                            documentProfile: event.currentTarget.value,
                          },
                        })
                      }
                    />
                    <Group justify="flex-end">
                      <Button
                        loading={policyMutation.isPending}
                        onClick={() =>
                          policyMutation.mutate({
                            postType: effectivePostType,
                            value: policy,
                          })
                        }
                      >
                        {__("Save content policy", TEXT_DOMAIN)}
                      </Button>
                    </Group>
                  </>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="status">
            <Accordion.Control>
              {__("Operational status", TEXT_DOMAIN)}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="sm">
                  {__("Next scheduled pass:", TEXT_DOMAIN)}{" "}
                  {statusQuery.data?.nextRunGmt
                    ? new Date(statusQuery.data.nextRunGmt).toLocaleString()
                    : __("Not scheduled", TEXT_DOMAIN)}
                </Text>
                {ingestion?.lastCompletedJobId && (
                  <Text size="sm">
                    {__("Last completed ingestion:", TEXT_DOMAIN)}{" "}
                    {ingestion.lastCompletedJobId}
                    {` (${ingestion.lastDeletedDocumentCount} ${__(
                      "documents deleted",
                      TEXT_DOMAIN,
                    )})`}
                  </Text>
                )}
                {(ingestion?.lastDeletedDocumentCount ?? 0) > 0 && (
                  <Alert
                    color="yellow"
                    title={__(
                      "The last ingestion removed documents",
                      TEXT_DOMAIN,
                    )}
                  >
                    {__(
                      "Review the source changes and backend ingestion statistics if this deletion was unexpected.",
                      TEXT_DOMAIN,
                    )}
                  </Alert>
                )}
                <Text size="sm">
                  {__("Remote source verification:", TEXT_DOMAIN)}{" "}
                  {manifest?.status === "available"
                    ? JSON.stringify(manifest.counts ?? {})
                    : __("Not available", TEXT_DOMAIN)}
                </Text>
                {remoteMissingCount + hashMismatchCount > 0 && (
                  <Alert
                    color="red"
                    title={__("Knowledge Base source drift detected", TEXT_DOMAIN)}
                  >
                    {`${remoteMissingCount} ${__(
                      "remote sources missing",
                      TEXT_DOMAIN,
                    )}; ${hashMismatchCount} ${__(
                      "source hashes differ",
                      TEXT_DOMAIN,
                    )}.`}
                  </Alert>
                )}
                <Text size="sm">
                  {__("Pending local work:", TEXT_DOMAIN)}{" "}
                  {hasPendingWork
                    ? JSON.stringify(statusQuery.data?.outbox)
                    : __("None", TEXT_DOMAIN)}
                </Text>
                <Text size="sm">
                  {__("Baseline records:", TEXT_DOMAIN)}{" "}
                  {statusQuery.data?.baselines.length ?? 0}
                </Text>
                <Text size="sm">
                  {__("Backend ingestion:", TEXT_DOMAIN)}{" "}
                  {ingestion
                    ? `${ingestion.status} (${ingestion.committedGeneration}/${ingestion.requestedGeneration})`
                    : transport?.remoteError ?? __("No remote state", TEXT_DOMAIN)}
                </Text>
                {ingestion?.status === "REVIEW_REQUIRED" && (
                  <Alert
                    color="red"
                    title={__("Backend ingestion requires review", TEXT_DOMAIN)}
                  >
                    {ingestion.lastError ??
                      __(
                        "The backend could not commit the requested Knowledge Base generation.",
                        TEXT_DOMAIN,
                      )}
                  </Alert>
                )}
                {massDeleteReviewCount > 0 && (
                  <Alert
                    color="red"
                    title={__("Large Knowledge Base deletion needs approval", TEXT_DOMAIN)}
                  >
                    <Stack gap="xs">
                      <Text size="sm">
                        {`${massDeleteReviewCount} ${__(
                          "current document tombstone(s) were blocked because the pending change set crosses the deletion safety threshold. Confirm only after reviewing the policy or source removal that caused it.",
                          TEXT_DOMAIN,
                        )}`}
                      </Text>
                      <Group justify="flex-end">
                        <Button
                          color="red"
                          size="xs"
                          loading={approveMassDeletionMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                __(
                                  "Approve the currently blocked Knowledge Base deletions? Only the displayed desired-state generations will be released.",
                                  TEXT_DOMAIN,
                                ),
                              )
                            ) {
                              approveMassDeletionMutation.mutate();
                            }
                          }}
                        >
                          {__("Approve current deletions", TEXT_DOMAIN)}
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                )}
                {manualReviewCount > 0 && (
                  <Alert
                    color="yellow"
                    title={__(
                      "Changes are waiting for manual review",
                      TEXT_DOMAIN,
                    )}
                  >
                    <Stack gap="xs">
                      <Text size="sm">
                        {__(
                          "Approve the selected content type to release its reviewed changes to the signed delivery queue.",
                          TEXT_DOMAIN,
                        )}
                      </Text>
                      <Group justify="flex-end">
                        <Button
                          size="xs"
                          loading={approveManualReviewMutation.isPending}
                          disabled={!effectivePostType}
                          onClick={() => approveManualReviewMutation.mutate()}
                        >
                          {__("Approve selected content type", TEXT_DOMAIN)}
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                )}
                {otherBlockedCount > 0 && (
                  <Alert
                    color="red"
                    title={__("Knowledge Sync has blocked work", TEXT_DOMAIN)}
                  >
                    <Text component="pre" size="xs" style={{ whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(statusQuery.data?.blockedReasons ?? {}, null, 2)}
                    </Text>
                  </Alert>
                )}
                <Text size="sm">
                  {__("WordPress vocabulary version:", TEXT_DOMAIN)}{" "}
                  {statusQuery.data?.vocabulary?.sourceVersion ??
                    __("Not synchronized", TEXT_DOMAIN)}
                </Text>
                <Text size="sm">
                  {__("Last runner result:", TEXT_DOMAIN)}{" "}
                  {statusQuery.data?.lastRun
                    ? `${statusQuery.data.lastRun.status}${
                        statusQuery.data.lastRun.completedGmt
                          ? ` (${new Date(
                              statusQuery.data.lastRun.completedGmt,
                            ).toLocaleString()})`
                          : ""
                      }`
                    : __("No completed run", TEXT_DOMAIN)}
                </Text>
                {statusQuery.data?.lastRun?.status === "partial-failure" && (
                  <Alert
                    color="red"
                    title={__(
                      "The last sync pass needs attention",
                      TEXT_DOMAIN,
                    )}
                  >
                    <Text
                      component="pre"
                      size="xs"
                      style={{ whiteSpace: "pre-wrap" }}
                    >
                      {JSON.stringify(
                        statusQuery.data.lastRun.blogs ?? [],
                        null,
                        2,
                      )}
                    </Text>
                  </Alert>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Card>
  );
}

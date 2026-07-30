// KB Config Editor - Metadata & Prompt Templates Management
// Edit metadata-config.yaml and prompt templates stored in S3

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconDeviceFloppy,
  IconEdit,
  IconFile,
  IconFileText,
  IconGitCompare,
  IconRefresh,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useEffect, useMemo, useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import { deriveMetadataFromSources } from "./api-client";
import {
  getMetadataConfig,
  getPromptTemplates,
  updateMetadataConfig,
  updatePromptTemplate,
  type MetadataConfig,
  type PromptTemplate,
} from "./backend-client";

import MonacoDiffEditor from "../../components/MonacoDiffEditor";
import MonacoEditor from "../../components/MonacoEditor";

// Utility: Convert camelCase to UPPERCASE-WITH-HYPHENS for display
function formatTemplateName(camelCase: string): string {
  // Insert hyphens before capital letters and convert to uppercase
  return camelCase
    .replace(/([A-Z])/g, "-$1")
    .replace(/^-/, "")
    .toUpperCase();
}

// Utility: Get detailed description for each template type
function getTemplateDescription(templateType: PromptTemplate["type"]): string {
  switch (templateType) {
    case "query":
      return __(
        "The model uses this template to build the KB retrieval query: it analyzes the user's question and selects relevant categories, subcategories, and tags for metadata filtering. Output must be JSON format (query, categories, subCategories, tags).",
        TEXT_DOMAIN,
      );
    case "summary":
      return __(
        "When conversation history grows too long, this template summarizes previous messages and context so the model can remember prior conversation without reprocessing every old message.",
        TEXT_DOMAIN,
      );
    case "answer":
      return __(
        "Default answer template in Chatbot mode when KB retrieval returned one or more snippets. The assistant must answer using the retrieved snippets/shared context according to the effective grounding policy.",
        TEXT_DOMAIN,
      );
    case "answerKbOnly":
      return __(
        "Used when grounding is required and fallback without KB is not allowed (requiresGrounding && !allowFallbackWithoutKb). The assistant explicitly states that the documentation does not contain the requested information and does not fall back to general knowledge.",
        TEXT_DOMAIN,
      );
    case "answerAskWhenNoKb":
      return __(
        "Used when grounding is not required, but fallback without KB is not allowed (!requiresGrounding && !allowFallbackWithoutKb). The assistant asks clarifying questions instead of guessing or using general knowledge.",
        TEXT_DOMAIN,
      );
    case "answerKbPreferred":
      return __(
        "Used when grounding is not required and fallback without KB is allowed (!requiresGrounding && allowFallbackWithoutKb). The assistant may answer from general knowledge, clearly labeled as not found in docs.",
        TEXT_DOMAIN,
      );
    case "answerKbRag":
      return __(
        "DocSearch-specific synthesis prompt used in KB research/search mode. This mode may combine evidence across multiple top-level categories and produce an AI Summary grounded in the retrieved snippets.",
        TEXT_DOMAIN,
      );
    default:
      return __(
        "Prompt template for backend AI operations. Markdown-formatted file stored in S3 with placeholders and instructions.",
        TEXT_DOMAIN,
      );
  }
}

type ConfigItem =
  | { type: "metadata"; label: string; description: string }
  | {
      type: "template";
      templateType: PromptTemplate["type"];
      label: string;
      description: string;
    };

interface KBConfigEditorProps {
  InfoLabel: (props: {
    text: string;
    scrollToId: string;
    onOpen: (targetScrollToId: string) => void;
  }) => JSX.Element;
  openInfo: (targetScrollToId: string) => void;
}

export default function KBConfigEditor({
  InfoLabel,
  openInfo,
}: KBConfigEditorProps) {
  const queryClient = useQueryClient();

  // Selected configuration item - null means list view, otherwise editing
  const [selectedItem, setSelectedItem] = useState<ConfigItem | null>(null);

  // View mode: 'edit' or 'diff'
  const [viewMode, setViewMode] = useState<"edit" | "diff">("edit");

  // Fetch metadata config
  const {
    data: metadataResponse,
    isLoading: isLoadingMetadata,
    error: metadataError,
    refetch: refetchMetadata,
  } = useQuery({
    queryKey: ["kb-metadata-config"],
    queryFn: getMetadataConfig,
  });

  // Fetch prompt templates
  const {
    data: templatesResponse,
    isLoading: isLoadingTemplates,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ["kb-prompt-templates"],
    queryFn: getPromptTemplates,
  });

  // Fetch KB-derived metadata structure (only when needed for diff view)
  const {
    data: derivedMetadata,
    isLoading: isLoadingDerived,
    refetch: refetchDerived,
  } = useQuery({
    queryKey: ["kb-derived-metadata"],
    queryFn: deriveMetadataFromSources,
    enabled: false, // Only fetch when explicitly requested
  });

  // Local state for editing
  const [editedContent, setEditedContent] = useState<string>("");

  // Compute original content from backend response (not state)
  const originalContent = useMemo(() => {
    if (!selectedItem) {
      return "";
    }

    if (selectedItem.type === "metadata" && metadataResponse?.config) {
      return typeof metadataResponse.config === "string"
        ? metadataResponse.config
        : JSON.stringify(metadataResponse.config, null, 2);
    }

    if (selectedItem.type === "template" && templatesResponse?.templates) {
      const template = templatesResponse.templates.find(
        (t) => t.type === selectedItem.templateType,
      );
      return template?.content || "";
    }

    return "";
  }, [selectedItem, metadataResponse, templatesResponse]);

  // Reset edited content when selection changes
  useEffect(() => {
    queueMicrotask(() => {
      if (selectedItem) {
        setEditedContent(originalContent);
        setViewMode("edit");
      } else {
        setEditedContent("");
      }
    });
  }, [selectedItem, originalContent]);

  // Fetch derived metadata when switching to diff mode for metadata-config
  useEffect(() => {
    if (
      selectedItem?.type === "metadata" &&
      viewMode === "diff" &&
      !derivedMetadata
    ) {
      refetchDerived();
    }
  }, [selectedItem, viewMode, derivedMetadata, refetchDerived]);

  // Update metadata mutation
  const metadataUpdateMutation = useMutation({
    mutationFn: (config: MetadataConfig) => updateMetadataConfig(config),
    onSuccess: () => {
      notifications.show({
        title: __("Metadata config saved", TEXT_DOMAIN),
        message: __("Configuration updated successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      queryClient.invalidateQueries({ queryKey: ["kb-metadata-config"] });
      setSelectedItem(null); // Return to list view
    },
    onError: (error: Error) => {
      notifications.show({
        title: __("Failed to save metadata config", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Update template mutation
  const templateUpdateMutation = useMutation({
    mutationFn: ({
      type,
      content,
    }: {
      type: PromptTemplate["type"];
      content: string;
    }) => updatePromptTemplate(type, content),
    onSuccess: () => {
      notifications.show({
        title: __("Template saved", TEXT_DOMAIN),
        message: __("Prompt template updated successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck size={16} />,
      });
      queryClient.invalidateQueries({ queryKey: ["kb-prompt-templates"] });
      setSelectedItem(null); // Return to list view
    },
    onError: (error: Error) => {
      notifications.show({
        title: __("Failed to save template", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const handleSave = () => {
    if (!selectedItem) return;

    if (selectedItem.type === "metadata") {
      const config = { raw: editedContent } as unknown as MetadataConfig;
      metadataUpdateMutation.mutate(config);
    } else if (selectedItem.type === "template") {
      templateUpdateMutation.mutate({
        type: selectedItem.templateType,
        content: editedContent,
      });
    }
  };

  const handleCancel = () => {
    setSelectedItem(null);
  };

  if (isLoadingMetadata || isLoadingTemplates) {
    return (
      <Card withBorder shadow="sm" p="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>{__("Loading configuration...", TEXT_DOMAIN)}</Text>
        </Stack>
      </Card>
    );
  }

  if (metadataError || templatesError) {
    return (
      <Card withBorder shadow="sm">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title={__("Failed to load configuration", TEXT_DOMAIN)}
          color="red"
        >
          <Text size="sm">
            {metadataError?.message || templatesError?.message}
          </Text>
        </Alert>
      </Card>
    );
  }

  // Define configurable items list
  const configItems: ConfigItem[] = [
    {
      type: "metadata",
      label: __("Metadata Configuration", TEXT_DOMAIN),
      description: __(
        "Define categories, subcategories, and tags for KB documents. Stored as YAML in S3. Use the compare view to see derived metadata from your sources.",
        TEXT_DOMAIN,
      ),
    },
    ...(templatesResponse?.templates.map((template) => ({
      type: "template" as const,
      templateType: template.type,
      label: formatTemplateName(template.type),
      description: getTemplateDescription(template.type),
    })) || []),
  ];

  // LIST VIEW - Show all configurable items
  if (!selectedItem) {
    return (
      <Card withBorder shadow="sm">
        <Stack gap="md">
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <div>
              <Title order={4}>
                <Group gap="xs">
                  <IconSettings size={20} />
                  <InfoLabel
                    text={__("KB Configuration", TEXT_DOMAIN)}
                    scrollToId="kb-config-metadata"
                    onOpen={openInfo}
                  />
                </Group>
              </Title>
              <Text size="sm" c="dimmed" mt="xs">
                {__(
                  "Manage metadata schema and prompt templates used by all KB documents. Click an item to edit its configuration.",
                  TEXT_DOMAIN,
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Tooltip label={__("Refresh", TEXT_DOMAIN)}>
                <ActionIcon
                  variant="light"
                  onClick={() => {
                    refetchMetadata();
                    refetchTemplates();
                  }}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Stack gap="xs">
            {configItems.map((item, index) => {
              const isMetadata = item.type === "metadata";
              const lastModified = isMetadata
                ? metadataResponse?.lastModified
                : templatesResponse?.templates.find(
                    (t) =>
                      item.type === "template" && t.type === item.templateType,
                  )?.lastModified;

              return (
                <Paper
                  key={index}
                  p="md"
                  withBorder
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedItem(item)}
                >
                  <Group
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                  >
                    <Group gap="md" wrap="nowrap">
                      {isMetadata ? (
                        <IconFile
                          size={20}
                          color="blue"
                          style={{ flexShrink: 0 }}
                        />
                      ) : (
                        <IconFileText
                          size={20}
                          color="green"
                          style={{ flexShrink: 0 }}
                        />
                      )}
                      <div>
                        <Text fw={500}>{item.label}</Text>
                        <Text size="sm" c="dimmed">
                          {item.description}
                        </Text>
                        {lastModified && (
                          <Text size="xs" c="dimmed" mt={4}>
                            {__("Last modified:", TEXT_DOMAIN)}{" "}
                            {new Date(lastModified).toLocaleString()}
                          </Text>
                        )}
                      </div>
                    </Group>
                    <Badge
                      color={isMetadata ? "blue" : "green"}
                      variant="light"
                      size="lg"
                      style={{ alignSelf: "center" }}
                    >
                      {isMetadata ? "YAML" : "Markdown"}
                    </Badge>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </Stack>
      </Card>
    );
  }

  // EDITOR VIEW - Show selected item editor
  const isMetadata = selectedItem.type === "metadata";
  const isSaving =
    metadataUpdateMutation.isPending || templateUpdateMutation.isPending;

  // Determine editor language
  const editorLanguage = isMetadata ? "yaml" : "markdown";

  // Check if content has been modified
  const hasChanges = editedContent !== originalContent;

  return (
    <Card withBorder shadow="sm">
      <Stack gap="md">
        <Group align="flex-start" justify="space-between">
          <div>
            <Title order={4}>
              <Group gap="xs">
                {isMetadata ? (
                  <IconFile size={20} />
                ) : (
                  <IconFileText size={20} />
                )}
                {selectedItem.label}
              </Group>
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              {selectedItem.description}
            </Text>
          </div>
          <Group gap="sm">
            {hasChanges && viewMode === "edit" && (
              <Badge color="orange" variant="light" size="lg">
                {__("Modified", TEXT_DOMAIN)}
              </Badge>
            )}
            <Badge color={isMetadata ? "blue" : "green"} size="lg">
              {isMetadata ? "YAML" : "Markdown"}
            </Badge>
          </Group>
        </Group>

        {/* View Mode Toggle: Edit or Diff (only for metadata-config) */}
        {isMetadata && (
          <Group justify="center">
            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as "edit" | "diff")}
              data={[
                {
                  value: "edit",
                  label: (
                    <Group gap="xs">
                      <IconEdit size={16} />
                      <span>{__("Edit", TEXT_DOMAIN)}</span>
                    </Group>
                  ),
                },
                {
                  value: "diff",
                  label: (
                    <Group gap="xs" wrap="nowrap">
                      <IconGitCompare size={16} />
                      <span>
                        {__("Compare with KB Structure", TEXT_DOMAIN)}
                      </span>
                    </Group>
                  ),
                },
              ]}
            />
          </Group>
        )}

        {/* Monaco Editor or Diff Viewer */}
        {isMetadata && viewMode === "diff" && (
          <Alert color="blue" icon={<IconAlertCircle size={16} />}>
            {__(
              "Comparing KB-derived structure (left) with current metadata-config.yaml (right)",
              TEXT_DOMAIN,
            )}
            {derivedMetadata?.stats && (
              <Text size="xs" mt="xs">
                {__("Analyzed", TEXT_DOMAIN)}:{" "}
                {derivedMetadata.stats.total_sections_analyzed}{" "}
                {__("sections", TEXT_DOMAIN)} •{" "}
                {derivedMetadata.stats.categories}{" "}
                {__("categories", TEXT_DOMAIN)} • {derivedMetadata.stats.tags}{" "}
                {__("tags", TEXT_DOMAIN)}
              </Text>
            )}
          </Alert>
        )}

        {viewMode === "edit" ? (
          <MonacoEditor
            key={
              selectedItem.type === "metadata"
                ? "metadata"
                : selectedItem.templateType
            }
            value={editedContent}
            onChange={(value) => setEditedContent(value || "")}
            language={editorLanguage}
            height="600px"
            theme="vs-light"
            minimap={true}
            wordWrap="on"
          />
        ) : isMetadata ? (
          isLoadingDerived ? (
            <Stack align="center" gap="md" p="xl">
              <Loader size="lg" />
              <Text>{__("Analyzing KB sources...", TEXT_DOMAIN)}</Text>
            </Stack>
          ) : (
            <MonacoDiffEditor
              key="diff-metadata"
              original={derivedMetadata?.yaml || "# No KB sources found"}
              modified={editedContent}
              language={editorLanguage}
              height="600px"
              theme="vs-light"
              renderSideBySide={true}
            />
          )
        ) : null}

        <Group justify="space-between">
          <Button
            variant="subtle"
            leftSection={<IconX size={16} />}
            onClick={handleCancel}
            disabled={isSaving}
          >
            {__("Cancel", TEXT_DOMAIN)}
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            loading={isSaving}
            disabled={!hasChanges}
          >
            {__("Save Changes", TEXT_DOMAIN)}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

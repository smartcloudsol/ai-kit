// KB Source List Component
// Displays and manages KB sources

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconEye,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useCallback, useMemo, useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import {
  fetchKBPostData,
  fetchKBSources,
  reenableKBSource,
  searchPosts,
  updateKBSource,
} from "./api-client";
import { deleteKBDocumentFromBackend } from "./backend-client";
import KBDocumentEditor from "./KBDocumentEditor.tsx";
import { kbSourceStatusPresentation } from "./kb-source-status";
import type { KBPublishStatus } from "./types";

interface KBSourceListProps {
  selectedPostId: number | null;
  onSelectPost: (postId: number | null) => void;
  accountId: string;
  siteId: string;
  backendAvailable: boolean;
  InfoLabel: (props: {
    text: string;
    scrollToId: string;
    onOpen: (targetScrollToId: string) => void;
  }) => JSX.Element;
  openInfo: (targetScrollToId: string) => void;
}

export default function KBSourceList({
  selectedPostId,
  onSelectPost,
  accountId,
  siteId,
  backendAvailable,
  InfoLabel,
  openInfo,
}: KBSourceListProps) {
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] =
    useDisclosure(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<"all" | "publish" | "draft">(
    "all",
  );
  const [typeFilter, setTypeFilter] = useState("all");
  const [kbStatusFilter, setKbStatusFilter] = useState<"all" | KBPublishStatus>(
    "all",
  );
  const statusPresentation = kbSourceStatusPresentation(__, TEXT_DOMAIN);
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

  // Fetch KB sources with pagination and filters
  const {
    data: sourcesData,
    isLoading: isLoadingSources,
    error: sourcesError,
    refetch: refetchSources,
  } = useQuery({
    queryKey: [
      "kb-sources",
      page,
      perPage,
      debouncedSearch,
      statusFilter,
      typeFilter,
      kbStatusFilter,
    ],
    queryFn: () =>
      fetchKBSources({
        page,
        per_page: perPage,
        search: debouncedSearch,
        status: statusFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
        kb_status: kbStatusFilter,
      }),
    enabled: backendAvailable,
  });

  const sources = useMemo(() => sourcesData?.items || [], [sourcesData]);
  const totalPages = sourcesData?.total_pages || 0;
  const postTypeOptions = useMemo(
    () => [
      { value: "all", label: __("All Types", TEXT_DOMAIN) },
      ...(sourcesData?.post_type_options || []),
    ],
    [sourcesData?.post_type_options],
  );

  // Modal state for adding new sources
  const [postSearchQuery, setPostSearchQuery] = useState<string>("");
  const [selectedPost, setSelectedPost] = useState<{
    post_id: number;
    post_title: string;
  } | null>(null);
  const [debouncedPostSearch] = useDebouncedValue(postSearchQuery, 300);

  // Search posts query (for "Add Source" modal)
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["kb-post-search", debouncedPostSearch],
    queryFn: () => searchPosts(debouncedPostSearch, 10),
    enabled: debouncedPostSearch.length > 0,
  });

  // Fetch post data when selected
  const {
    data: postData,
    isLoading: isLoadingPost,
    refetch: refetchPostData,
  } = useQuery({
    queryKey: ["kb-post", selectedPostId],
    queryFn: () => fetchKBPostData(selectedPostId!),
    enabled: selectedPostId !== null,
  });

  // Enable post as KB source
  const enableMutation = useMutation({
    mutationFn: (postId: number) =>
      updateKBSource(postId, {
        enabled: true,
        default_doc_mode: "base_only",
      }),
    onSuccess: () => {
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("KB source enabled successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      refetchSources();
      closeAddModal();
      setPostSearchQuery("");
      setSelectedPost(null);
    },
    onError: (error: Error) => {
      notifications.show({
        title: __("Error", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle />,
      });
    },
  });

  // Disable KB source
  const disableMutation = useMutation({
    mutationFn: (postId: number) =>
      updateKBSource(postId, {
        enabled: false,
      }),
    onSuccess: () => {
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("KB source disabled successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      refetchSources();
      if (selectedPostId === disableMutation.variables) {
        onSelectPost(null);
      }
    },
    onError: (error: Error) => {
      notifications.show({
        title: __("Error", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle />,
      });
    },
  });

  // Re-enable KB source
  const reenableMutation = useMutation({
    mutationFn: (postId: number) => reenableKBSource(postId),
    onSuccess: () => {
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __(
          "KB source re-enabled and content regenerated",
          TEXT_DOMAIN,
        ),
        color: "green",
        icon: <IconCheck />,
      });
      refetchSources();
      if (selectedPostId) {
        refetchPostData();
      }
    },
    onError: (error: Error) => {
      notifications.show({
        title: __("Error", TEXT_DOMAIN),
        message: error.message,
        color: "red",
        icon: <IconAlertCircle />,
      });
    },
  });

  const handleAddSource = useCallback(() => {
    if (!selectedPost) {
      // Try to parse searchQuery as ID
      const postId = parseInt(searchQuery, 10);
      if (!postId || isNaN(postId)) {
        notifications.show({
          title: __("Invalid input", TEXT_DOMAIN),
          message: __(
            "Please select a post or enter a valid post ID",
            TEXT_DOMAIN,
          ),
          color: "orange",
          icon: <IconAlertCircle />,
        });
        return;
      }
      enableMutation.mutate(postId);
      return;
    }
    enableMutation.mutate(selectedPost.post_id);
  }, [selectedPost, searchQuery, enableMutation]);

  const handleDisable = useCallback(
    async (postId: number) => {
      // Find the source to check if it's disabled but published
      const source = sources.find((s) => s.post_id === postId);
      const isDisabledButPublished = source?.is_disabled_but_published || false;

      modals.openConfirmModal({
        title: isDisabledButPublished
          ? __("Delete Published Content", TEXT_DOMAIN)
          : __("Disable KB Source", TEXT_DOMAIN),
        children: (
          <Text size="sm">
            {isDisabledButPublished
              ? __(
                  "Are you sure you want to delete all published documents from the Knowledge Base? This source is already disabled.",
                  TEXT_DOMAIN,
                )
              : __(
                  "Are you sure you want to disable this KB source? This will also delete all published documents from the backend.",
                  TEXT_DOMAIN,
                )}
          </Text>
        ),
        labels: {
          confirm: isDisabledButPublished
            ? __("Delete", TEXT_DOMAIN)
            : __("Disable", TEXT_DOMAIN),
          cancel: __("Cancel", TEXT_DOMAIN),
        },
        confirmProps: { color: "red" },
        onConfirm: async () => {
          try {
            // Fetch post data to get document IDs for backend deletion
            const data = await fetchKBPostData(postId);

            // Delete all published documents from backend
            for (const doc of data.docs) {
              if (doc.publish_state?.last_backend_status === "success") {
                try {
                  await deleteKBDocumentFromBackend(
                    postId,
                    accountId,
                    siteId,
                    doc.doc_id,
                  );
                } catch (error) {
                  console.error(
                    `Failed to delete document ${doc.doc_id} from backend:`,
                    error,
                  );
                  // Continue with other documents even if one fails
                }
              }
            }
          } catch (error) {
            console.error(
              "Failed to fetch post data for backend deletion:",
              error,
            );
            // Continue with disable even if backend deletion fails
          }

          // Only disable source if it's not already disabled
          if (!isDisabledButPublished) {
            disableMutation.mutate(postId);
          } else {
            // For already disabled sources, update the source to clear publish state
            try {
              await updateKBSource(postId, { enabled: false });
              refetchSources();
              notifications.show({
                title: __("Success", TEXT_DOMAIN),
                message: __(
                  "Published content deleted successfully",
                  TEXT_DOMAIN,
                ),
                color: "green",
                icon: <IconCheck />,
              });
            } catch (error) {
              console.error("Failed to update source state:", error);
              notifications.show({
                title: __("Error", TEXT_DOMAIN),
                message: __(
                  "Failed to update source state. Please refresh the page.",
                  TEXT_DOMAIN,
                ),
                color: "red",
                icon: <IconAlertCircle />,
              });
            }
          }
          if (selectedPostId) {
            refetchPostData();
          }
        },
      });
    },
    [
      disableMutation,
      accountId,
      siteId,
      sources,
      refetchSources,
      refetchPostData,
      selectedPostId,
    ],
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Stack gap="md">
      {/* Sources list */}
      <Card withBorder shadow="sm">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Title order={5}>
                <InfoLabel
                  text={__("KB Sources", TEXT_DOMAIN)}
                  scrollToId="kb-sources-list"
                  onOpen={openInfo}
                />
              </Title>
              <Text size="sm" c="dimmed" mt="4px">
                {__(
                  "Posts and pages enabled as knowledge base sources. Click a source to edit its documents and sections.",
                  TEXT_DOMAIN,
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Tooltip label={__("Refresh", TEXT_DOMAIN)}>
                <ActionIcon
                  variant="light"
                  onClick={() => refetchSources()}
                  loading={isLoadingSources}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={openAddModal}
              >
                {__("Add Source", TEXT_DOMAIN)}
              </Button>
            </Group>
          </Group>

          {/* Filters */}
          <Group gap="xs" align="flex-end">
            <TextInput
              placeholder={__("Search by post title...", TEXT_DOMAIN)}
              description={__(
                "Filter sources by post or page title",
                TEXT_DOMAIN,
              )}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.currentTarget.value);
                setPage(1); // Reset to first page on search
              }}
              leftSection={<IconSearch size={14} />}
              style={{ flex: 1, maxWidth: 300 }}
            />
            <Select
              placeholder={__("All Statuses", TEXT_DOMAIN)}
              description={__("WordPress post status", TEXT_DOMAIN)}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value as "all" | "publish" | "draft");
                setPage(1);
              }}
              data={[
                { value: "all", label: __("All Statuses", TEXT_DOMAIN) },
                { value: "publish", label: __("Live", TEXT_DOMAIN) },
                { value: "draft", label: __("Draft", TEXT_DOMAIN) },
              ]}
              style={{ width: 150 }}
            />
            <Select
              placeholder={__("All Types", TEXT_DOMAIN)}
              description={__("Post type filter", TEXT_DOMAIN)}
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value || "all");
                setPage(1);
              }}
              data={postTypeOptions}
              style={{ width: 150 }}
            />
            <Select
              placeholder={__("All KB Statuses", TEXT_DOMAIN)}
              description={__("Publication status", TEXT_DOMAIN)}
              value={kbStatusFilter}
              onChange={(value) => {
                setKbStatusFilter((value as typeof kbStatusFilter) || "all");
                setPage(1);
              }}
              data={[
                { value: "all", label: __("All KB Status", TEXT_DOMAIN) },
                ...Object.entries(statusPresentation).map(
                  ([value, { label }]) => ({ value, label }),
                ),
              ]}
              style={{ width: 180 }}
            />
          </Group>

          {/* Loading state */}
          {isLoadingSources && (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          )}

          {/* Error state */}
          {sourcesError && (
            <Text size="sm" c="red">
              {__("Error loading sources", TEXT_DOMAIN)}
            </Text>
          )}

          {/* Empty state */}
          {!isLoadingSources && !sourcesError && sources.length === 0 ? (
            <Text size="sm" c="dimmed">
              {__(
                "No KB sources found. Click 'Add Source' to enable a post.",
                TEXT_DOMAIN,
              )}
            </Text>
          ) : null}

          {/* Table */}
          {!isLoadingSources && !sourcesError && sources.length > 0 ? (
            <Table.ScrollContainer minWidth={600} maw="calc(100vw - 76px)">
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{__("Post ID", TEXT_DOMAIN)}</Table.Th>
                    <Table.Th>{__("Title", TEXT_DOMAIN)}</Table.Th>
                    <Table.Th>{__("Type", TEXT_DOMAIN)}</Table.Th>
                    <Table.Th>{__("Status", TEXT_DOMAIN)}</Table.Th>{" "}
                    <Table.Th>{__("/KB Status", TEXT_DOMAIN)}</Table.Th>{" "}
                    <Table.Th>{__("Updated", TEXT_DOMAIN)}</Table.Th>
                    <Table.Th>{__("Actions", TEXT_DOMAIN)}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sources.map((source) => (
                    <Table.Tr
                      key={source.post_id}
                      style={{
                        backgroundColor:
                          selectedPostId === source.post_id
                            ? "var(--mantine-color-blue-light)"
                            : undefined,
                      }}
                    >
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          #{source.post_id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="sm">{source.post_title}</Text>
                          {source.is_disabled_but_published && (
                            <Tooltip
                              label={__(
                                "This source is disabled but still has published content in the KB. Delete it to remove from backend.",
                                TEXT_DOMAIN,
                              )}
                            >
                              <Badge size="xs" color="orange">
                                {__("Disabled", TEXT_DOMAIN)}
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light">
                          {source.post_type_label || source.post_type}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={
                            source.post_status === "publish" ? "green" : "gray"
                          }
                        >
                          {source.post_status === "publish"
                            ? __("Live", TEXT_DOMAIN)
                            : __("Draft", TEXT_DOMAIN)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip
                          disabled={
                            source.kb_publish_status !== "sync_delivered"
                          }
                          label={__(
                            "Backend delivery acknowledged. Knowledge Base indexing is not verified by this status.",
                            TEXT_DOMAIN,
                          )}
                          multiline
                          w={280}
                        >
                          <Badge
                            size="sm"
                            tabIndex={0}
                            color={
                              statusPresentation[source.kb_publish_status].color
                            }
                          >
                            {statusPresentation[source.kb_publish_status].label}
                          </Badge>
                        </Tooltip>
                        {source.kb_sync_error && (
                          <Text
                            size="xs"
                            c="red"
                            maw={280}
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {source.kb_sync_error}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {formatDate(source.updated_at)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Tooltip
                            label={
                              !source.enabled
                                ? __(
                                    "Disabled - Re-enable to edit",
                                    TEXT_DOMAIN,
                                  )
                                : __("View/Edit", TEXT_DOMAIN)
                            }
                          >
                            <ActionIcon
                              variant="light"
                              size="sm"
                              onClick={() => onSelectPost(source.post_id)}
                              disabled={!source.enabled}
                            >
                              {selectedPostId === source.post_id ? (
                                <IconPencil size={14} />
                              ) : (
                                <IconEye size={14} />
                              )}
                            </ActionIcon>
                          </Tooltip>
                          {!source.enabled && (
                            <Tooltip
                              label={__(
                                "Re-enable and Regenerate",
                                TEXT_DOMAIN,
                              )}
                            >
                              <ActionIcon
                                variant="light"
                                size="sm"
                                color="green"
                                onClick={() =>
                                  reenableMutation.mutate(source.post_id)
                                }
                                loading={
                                  reenableMutation.isPending &&
                                  reenableMutation.variables === source.post_id
                                }
                              >
                                <IconRefresh size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          <Tooltip
                            label={
                              source.is_disabled_but_published
                                ? __("Delete Published Content", TEXT_DOMAIN)
                                : __("Disable", TEXT_DOMAIN)
                            }
                          >
                            <ActionIcon
                              variant="light"
                              size="sm"
                              color="red"
                              onClick={() => handleDisable(source.post_id)}
                              loading={
                                disableMutation.isPending &&
                                disableMutation.variables === source.post_id
                              }
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : null}

          {/* Pagination */}
          {!isLoadingSources && !sourcesError && totalPages > 1 && (
            <Group justify="center">
              <Pagination
                value={page}
                onChange={setPage}
                total={totalPages}
                size="sm"
              />
            </Group>
          )}
        </Stack>
      </Card>

      {/* Document editor */}
      {selectedPostId && postData && (
        <KBDocumentEditor
          postData={postData}
          isLoading={isLoadingPost}
          onRefresh={refetchPostData}
          onClose={() => onSelectPost(null)}
          accountId={accountId}
          siteId={siteId}
          InfoLabel={InfoLabel}
          openInfo={openInfo}
        />
      )}

      {/* Add source modal */}
      <Modal
        opened={addModalOpened}
        onClose={() => {
          closeAddModal();
          setPostSearchQuery("");
          setSelectedPost(null);
        }}
        title={__("Add KB Source", TEXT_DOMAIN)}
      >
        <Stack gap="md">
          {selectedPost ? (
            <Card withBorder padding="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <div>
                    <Text fw={500}>{selectedPost.post_title}</Text>
                    <Text size="xs" c="dimmed">
                      ID: {selectedPost.post_id}
                    </Text>
                  </div>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setSelectedPost(null)}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              </Stack>
            </Card>
          ) : (
            <>
              <Text size="sm">
                {__(
                  "Search for a post by title or ID to enable as KB source:",
                  TEXT_DOMAIN,
                )}
              </Text>
              <TextInput
                label={__("Search posts", TEXT_DOMAIN)}
                description={__(
                  "Type a post title to search, or enter a numeric post ID directly",
                  TEXT_DOMAIN,
                )}
                placeholder={__("Post title or ID (e.g. 123)...", TEXT_DOMAIN)}
                value={postSearchQuery}
                onChange={(event) =>
                  setPostSearchQuery(event.currentTarget.value)
                }
                rightSection={isSearching ? <Loader size="xs" /> : null}
              />
              {searchResults && searchResults.length > 0 && (
                <Card withBorder padding="0">
                  <Stack gap="0">
                    {searchResults.map((post) => (
                      <Button
                        key={post.post_id}
                        variant="subtle"
                        fullWidth
                        style={{
                          justifyContent: "flex-start",
                          borderRadius: 0,
                          height: "auto",
                          padding: "0.75rem",
                        }}
                        onClick={() => {
                          setSelectedPost({
                            post_id: post.post_id,
                            post_title: post.post_title,
                          });
                        }}
                      >
                        <Group
                          gap="md"
                          align="flex-start"
                          wrap="nowrap"
                          style={{ width: "100%" }}
                        >
                          {post.featured_image_url && (
                            <img
                              src={post.featured_image_url}
                              alt={post.post_title}
                              style={{
                                width: "48px",
                                height: "48px",
                                objectFit: "cover",
                                borderRadius: "4px",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Stack
                            gap="4px"
                            align="flex-start"
                            style={{ flex: 1, textAlign: "left" }}
                          >
                            <Text
                              size="sm"
                              fw={500}
                              style={{ textAlign: "left" }}
                            >
                              {post.post_title}
                            </Text>
                            {post.post_excerpt && (
                              <Text
                                size="xs"
                                c="dimmed"
                                lineClamp={2}
                                style={{ textAlign: "left" }}
                              >
                                {post.post_excerpt}
                              </Text>
                            )}
                            <Text
                              size="xs"
                              c="dimmed"
                              style={{ textAlign: "left" }}
                            >
                              ID: {post.post_id} •{" "}
                              {post.post_type_label || post.post_type}
                            </Text>
                          </Stack>
                        </Group>
                      </Button>
                    ))}
                  </Stack>
                </Card>
              )}
              {debouncedPostSearch &&
                searchResults &&
                searchResults.length === 0 && (
                  <Text size="sm" c="dimmed">
                    {__("No posts found", TEXT_DOMAIN)}
                  </Text>
                )}
            </>
          )}
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                closeAddModal();
                setSearchQuery("");
                setSelectedPost(null);
              }}
            >
              {__("Cancel", TEXT_DOMAIN)}
            </Button>
            <Button
              onClick={handleAddSource}
              loading={enableMutation.isPending}
              leftSection={<IconCheck size={16} />}
              disabled={!selectedPost && !searchQuery}
            >
              {__("Enable Source", TEXT_DOMAIN)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

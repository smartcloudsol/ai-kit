// KB Document Editor Component
// Edit and publish KB documents and sections

import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconEdit,
  IconFile,
  IconInfoCircle,
  IconLock,
  IconLockOpen,
  IconRefresh,
  IconSend,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useCallback, useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import {
  approveKBPost,
  deleteKBOverride,
  fetchKBSettings,
  regenerateKBPost,
  saveKBOverride,
  updateKBSource,
} from "./api-client";
import {
  publishKBDocumentsToBackend,
  syncPublishStateToWordPress,
  type KBDocumentUpload,
} from "./backend-client";
import type { KBPostData, KBSection } from "./types";

type KBDocumentData = KBPostData["docs"][number];

interface KBDocumentEditorProps {
  postData: KBPostData;
  isLoading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  accountId: string;
  siteId: string;
  InfoLabel: (props: {
    text: string;
    scrollToId: string;
    onOpen: (targetScrollToId: string) => void;
  }) => JSX.Element;
  openInfo: (targetScrollToId: string) => void;
}

export default function KBDocumentEditor({
  postData,
  isLoading,
  onRefresh,
  onClose,
  accountId,
  siteId,
}: KBDocumentEditorProps) {
  const queryClient = useQueryClient();
  const clearDerivedMetadataCache = () => {
    queryClient.removeQueries({ queryKey: ["kb-derived-metadata"] });
  };

  const [editingSection, setEditingSection] = useState<{
    docId: string;
    sectionId: string;
    md: string;
    title?: string;
    category?: string;
    subcategory?: string;
    tags?: string[];
  } | null>(null);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] =
    useDisclosure(false);
  const [editingDocumentMetadata, setEditingDocumentMetadata] = useState<{
    docId: string;
    sectionId: string;
    isBaseDocument: boolean;
    locked: boolean;
    overrideMd: string;
    preservedTitle?: string;
    description?: string;
    postUrl?: string;
    category?: string;
    subcategory?: string;
    tags?: string[];
  } | null>(null);
  const [
    documentMetadataModalOpened,
    { open: openDocumentMetadataModal, close: closeDocumentMetadataModal },
  ] = useDisclosure(false);

  // Fetch KB settings for base URL override
  const { data: kbSettings } = useQuery({
    queryKey: ["kb-settings"],
    queryFn: fetchKBSettings,
  });

  const resolveDocumentMetadataSection = useCallback((doc: KBDocumentData) => {
    if (doc.doc_id.endsWith("/base")) {
      return (
        doc.sections.find((section) => section.section_id === "main") ?? null
      );
    }

    return doc.sections.find((section) => section.mode !== "exclude") ?? null;
  }, []);

  const getSectionPostUrlOverride = useCallback(
    (section: KBSection | null | undefined) => {
      const overridePostUrl = section?.override?.override_meta?.postUrl;
      return typeof overridePostUrl === "string" && overridePostUrl !== ""
        ? overridePostUrl
        : undefined;
    },
    [],
  );

  const getGeneratedSectionPostUrl = useCallback(
    (section: KBSection | null | undefined) => {
      const generatedPostUrl = section?.extra_meta?.postUrl;
      return typeof generatedPostUrl === "string" && generatedPostUrl !== ""
        ? generatedPostUrl
        : undefined;
    },
    [],
  );

  const getDefaultPublishedPostUrl = useCallback(() => {
    if (!kbSettings?.base_url_override) {
      return postData.post_url;
    }

    try {
      const url = new URL(postData.post_url);
      return `${kbSettings.base_url_override.replace(/\/+$/, "")}${
        url.pathname
      }${url.search}${url.hash}`;
    } catch {
      return kbSettings.base_url_override;
    }
  }, [kbSettings, postData.post_url]);

  const getEffectiveDocumentPostUrl = useCallback(
    (doc: KBDocumentData) => {
      const primarySection = resolveDocumentMetadataSection(doc);
      const overridePostUrl = getSectionPostUrlOverride(primarySection);

      if (overridePostUrl) {
        return overridePostUrl;
      }

      if (!doc.doc_id.endsWith("/base")) {
        // Separate documents may define their own source URL in the block or
        // Elementor settings. Base documents receive an automatically generated
        // WordPress permalink here, so their generated value must not bypass the
        // global Base URL Override.
        const configuredPostUrl = getGeneratedSectionPostUrl(primarySection);
        if (configuredPostUrl) {
          return configuredPostUrl;
        }

        const baseDoc = postData.docs.find((candidate) =>
          candidate.doc_id.endsWith("/base"),
        );
        const baseSection = baseDoc
          ? resolveDocumentMetadataSection(baseDoc)
          : null;
        const inheritedBaseUrl = getSectionPostUrlOverride(baseSection);

        if (inheritedBaseUrl) {
          return inheritedBaseUrl;
        }
      }

      return getDefaultPublishedPostUrl();
    },
    [
      getDefaultPublishedPostUrl,
      getGeneratedSectionPostUrl,
      getSectionPostUrlOverride,
      postData.docs,
      resolveDocumentMetadataSection,
    ],
  );

  const getEditableDocumentPostUrl = useCallback(
    (doc: KBDocumentData) => {
      const metadataSection = resolveDocumentMetadataSection(doc);
      const overridePostUrl = getSectionPostUrlOverride(metadataSection);

      if (overridePostUrl || doc.doc_id.endsWith("/base")) {
        return overridePostUrl;
      }

      return getGeneratedSectionPostUrl(metadataSection);
    },
    [
      getGeneratedSectionPostUrl,
      getSectionPostUrlOverride,
      resolveDocumentMetadataSection,
    ],
  );

  // Regenerate mutation
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateKBPost(postData.post_id),
    onSuccess: () => {
      clearDerivedMetadataCache();
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("KB content regenerated successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
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

  // Approve mutation (mark as reviewed)
  const approveMutation = useMutation({
    mutationFn: () => approveKBPost(postData.post_id),
    onSuccess: (data) => {
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __(
          `${data.docs_approved} document(s) approved for publishing`,
          TEXT_DOMAIN,
        ),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
      // Invalidate kb-sources cache to refresh status in source list
      queryClient.invalidateQueries({ queryKey: ["kb-sources"] });
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

  // Save override mutation
  const saveOverrideMutation = useMutation({
    mutationFn: (data: {
      docId: string;
      sectionId: string;
      md: string;
      title?: string;
      category?: string;
      subcategory?: string;
      tags?: string[];
    }) =>
      saveKBOverride(postData.post_id, {
        doc_id: data.docId,
        section_id: data.sectionId,
        override_md: data.md,
        override_meta: {
          title: data.title,
          category: data.category,
          subcategory: data.subcategory,
          tags: data.tags,
        },
        locked: true,
      }),
    onSuccess: () => {
      clearDerivedMetadataCache();
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("Override saved successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
      closeEditModal();
      setEditingSection(null);
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

  const saveDocumentMetadataMutation = useMutation({
    mutationFn: (data: {
      docId: string;
      sectionId: string;
      locked: boolean;
      overrideMd: string;
      preservedTitle?: string;
      description?: string;
      postUrl?: string;
      category?: string;
      subcategory?: string;
      tags?: string[];
    }) =>
      saveKBOverride(postData.post_id, {
        doc_id: data.docId,
        section_id: data.sectionId,
        override_md: data.locked ? data.overrideMd : "",
        override_meta: {
          title: data.preservedTitle,
          description: data.description,
          postUrl: data.postUrl,
          category: data.category,
          subcategory: data.subcategory,
          tags: data.tags,
        },
        locked: data.locked,
      }),
    onSuccess: () => {
      clearDerivedMetadataCache();
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("Document metadata saved successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
      closeDocumentMetadataModal();
      setEditingDocumentMetadata(null);
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

  const resetDocumentMetadataMutation = useMutation({
    mutationFn: async (data: {
      docId: string;
      sectionId: string;
      locked: boolean;
      overrideMd: string;
    }) => {
      if (!data.locked) {
        return deleteKBOverride(postData.post_id, {
          doc_id: data.docId,
          section_id: data.sectionId,
        });
      }

      return saveKBOverride(postData.post_id, {
        doc_id: data.docId,
        section_id: data.sectionId,
        override_md: data.locked ? data.overrideMd : "",
        override_meta: {},
        locked: data.locked,
      });
    },
    onSuccess: () => {
      clearDerivedMetadataCache();
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("Document metadata reset successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
      closeDocumentMetadataModal();
      setEditingDocumentMetadata(null);
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

  // Delete override mutation
  const deleteOverrideMutation = useMutation({
    mutationFn: (data: { docId: string; sectionId: string }) =>
      deleteKBOverride(postData.post_id, {
        doc_id: data.docId,
        section_id: data.sectionId,
      }),
    onSuccess: () => {
      clearDerivedMetadataCache();
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("Override deleted successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
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

  // Publish mutation - now uses direct backend call with batch upload
  const publishMutation = useMutation({
    mutationFn: () => {
      // Build backend document structures for ALL documents in the post
      // This ensures the backend can clean up orphan files
      const backendDocs: KBDocumentUpload[] = postData.docs.map((doc) => {
        const documentTitle = getEffectiveDocumentTitle(doc);
        const documentDescription = getEffectiveDocumentDescription(doc);
        const documentPostUrl = getEffectiveDocumentPostUrl(doc);

        return {
          doc_id: doc.doc_id,
          title: documentTitle,
          sections: doc.sections
            .filter((s) => s.mode !== "exclude")
            .map((s, index) => ({
              section_id: s.section_id,
              title:
                s.override?.override_meta?.title ||
                s.title ||
                postData.post_title,
              content: s.override?.locked ? s.override.override_md : s.md,
              order_index: s.sort_order ?? index,
              tags: s.override?.override_meta?.tags ?? s.tags ?? undefined,
              extra_meta: {
                category: s.override?.override_meta?.category ?? s.category,
                subcategory:
                  s.override?.override_meta?.subcategory ?? s.subcategory,
                description:
                  s.override?.override_meta?.description ??
                  s.extra_meta?.description,
                has_override: s.has_override,
                needs_review: s.needs_review,
              },
            })),
          metadata: {
            origin: "wordpress",
            revision: 1,
            updatedAt: new Date().toISOString(),
            description: documentDescription,
            postId: postData.post_id,
            postTitle: postData.post_title,
            postUrl: documentPostUrl,
            siteId: siteId,
            accountId: accountId,
          },
        };
      });

      return publishKBDocumentsToBackend(
        postData.post_id,
        backendDocs,
        accountId,
        siteId,
      );
    },
    onSuccess: async (response) => {
      // Sync publish state to WordPress database
      try {
        await syncPublishStateToWordPress(
          postData.post_id,
          response.uploadedDocuments,
        );
      } catch (error) {
        console.error("Failed to sync publish state to WordPress:", error);
        // Don't fail the entire operation, just log the error
      }

      // If source was disabled, re-enable it after successful publish
      if (postData.source && !postData.source.enabled) {
        try {
          await updateKBSource(postData.post_id, { enabled: true });
        } catch (error) {
          console.error("Failed to re-enable source:", error);
          // Don't fail the entire operation
        }
      }

      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("Documents published successfully to KB", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      onRefresh();
      // Invalidate kb-sources cache to refresh status in source list
      queryClient.invalidateQueries({ queryKey: ["kb-sources"] });
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

  const handleEditSection = useCallback(
    (docId: string, section: KBSection) => {
      setEditingSection({
        docId,
        sectionId: section.section_id,
        md: section.override?.override_md || section.md,
        title:
          section.override?.override_meta?.title ?? section.title ?? undefined,
        category:
          section.override?.override_meta?.category ??
          section.category ??
          undefined,
        subcategory:
          section.override?.override_meta?.subcategory ??
          section.subcategory ??
          undefined,
        tags:
          section.override?.override_meta?.tags ?? section.tags ?? undefined,
      });
      openEditModal();
    },
    [openEditModal],
  );

  const getDocumentMetadataSection = resolveDocumentMetadataSection;

  const handleEditDocumentMetadata = useCallback(
    (doc: KBDocumentData) => {
      const section = getDocumentMetadataSection(doc);
      if (!section) {
        return;
      }

      setEditingDocumentMetadata({
        docId: doc.doc_id,
        sectionId: section.section_id,
        isBaseDocument: doc.doc_id.endsWith("/base"),
        locked: section.override?.locked ?? false,
        overrideMd: section.override?.override_md ?? "",
        preservedTitle: section.override?.override_meta?.title ?? undefined,
        description:
          section.override?.override_meta?.description ??
          section.extra_meta?.description ??
          postData.post_excerpt ??
          undefined,
        postUrl: getEditableDocumentPostUrl(doc),
        category:
          section.override?.override_meta?.category ??
          section.category ??
          undefined,
        subcategory:
          section.override?.override_meta?.subcategory ??
          section.subcategory ??
          undefined,
        tags:
          section.override?.override_meta?.tags ?? section.tags ?? undefined,
      });
      openDocumentMetadataModal();
    },
    [
      getDocumentMetadataSection,
      getEditableDocumentPostUrl,
      openDocumentMetadataModal,
      postData.post_excerpt,
    ],
  );

  const handleResetDocumentMetadata = useCallback(
    (data: {
      docId: string;
      sectionId: string;
      isBaseDocument: boolean;
      locked: boolean;
      overrideMd: string;
    }) => {
      modals.openConfirmModal({
        title: __("Reset Document Metadata", TEXT_DOMAIN),
        children: (
          <Text size="sm">
            {__(
              "Reset title, description, source URL, category, subcategory, and tags back to the generated values? This keeps any locked markdown override intact.",
              TEXT_DOMAIN,
            )}
          </Text>
        ),
        labels: {
          confirm: __("Reset Metadata", TEXT_DOMAIN),
          cancel: __("Cancel", TEXT_DOMAIN),
        },
        confirmProps: { color: "red" },
        onConfirm: () =>
          resetDocumentMetadataMutation.mutate({
            docId: data.docId,
            sectionId: data.sectionId,
            locked: data.locked,
            overrideMd: data.overrideMd,
          }),
      });
    },
    [resetDocumentMetadataMutation],
  );

  const handleSaveOverride = useCallback(() => {
    if (!editingSection) return;
    saveOverrideMutation.mutate(editingSection);
  }, [editingSection, saveOverrideMutation]);

  const handleSaveDocumentMetadata = useCallback(() => {
    if (!editingDocumentMetadata) return;
    saveDocumentMetadataMutation.mutate(editingDocumentMetadata);
  }, [editingDocumentMetadata, saveDocumentMetadataMutation]);

  const getEffectiveDocumentMetadata = useCallback(
    (doc: KBDocumentData) => {
      const metadataSection = getDocumentMetadataSection(doc);
      if (!metadataSection) {
        return null;
      }

      return {
        section: metadataSection,
        docId: doc.doc_id,
        sectionId: metadataSection.section_id,
        isBaseDocument: doc.doc_id.endsWith("/base"),
        locked: metadataSection.override?.locked ?? false,
        overrideMd: metadataSection.override?.override_md ?? "",
        title:
          metadataSection.override?.override_meta?.title ??
          metadataSection.title ??
          null,
        preservedTitle: metadataSection.override?.override_meta?.title,
        description:
          metadataSection.override?.override_meta?.description ??
          metadataSection.extra_meta?.description ??
          postData.post_excerpt ??
          null,
        postUrl: getEffectiveDocumentPostUrl(doc),
        editablePostUrl: getEditableDocumentPostUrl(doc) ?? null,
        category:
          metadataSection.override?.override_meta?.category ??
          metadataSection.category ??
          null,
        subcategory:
          metadataSection.override?.override_meta?.subcategory ??
          metadataSection.subcategory ??
          null,
        tags:
          metadataSection.override?.override_meta?.tags ??
          metadataSection.tags ??
          [],
        hasCustomMetadata: Boolean(
          metadataSection.override?.override_meta?.title ||
            metadataSection.override?.override_meta?.description ||
            metadataSection.override?.override_meta?.postUrl ||
            metadataSection.override?.override_meta?.category ||
            metadataSection.override?.override_meta?.subcategory ||
            (metadataSection.override?.override_meta?.tags || []).length > 0,
        ),
      };
    },
    [
      getDocumentMetadataSection,
      getEditableDocumentPostUrl,
      getEffectiveDocumentPostUrl,
      postData.post_excerpt,
    ],
  );

  const getEffectiveDocumentTitle = useCallback(
    (doc: KBDocumentData) => {
      const primarySection = doc.sections.find(
        (section) => section.mode !== "exclude",
      );

      if (!primarySection) {
        return postData.post_title;
      }

      return (
        primarySection.override?.override_meta?.title ||
        primarySection.title ||
        postData.post_title
      );
    },
    [postData.post_title],
  );

  const getEffectiveDocumentDescription = useCallback(
    (doc: KBDocumentData) => {
      const primarySection = doc.sections.find(
        (section) => section.mode !== "exclude",
      );

      if (!primarySection) {
        return postData.post_excerpt || undefined;
      }

      return (
        primarySection.override?.override_meta?.description ||
        primarySection.extra_meta?.description ||
        postData.post_excerpt ||
        undefined
      );
    },
    [postData.post_excerpt],
  );

  const handleDeleteOverride = useCallback(
    (docId: string, sectionId: string) => {
      modals.openConfirmModal({
        title: __("Delete Override", TEXT_DOMAIN),
        children: (
          <Text size="sm">
            {__("Are you sure you want to delete this override?", TEXT_DOMAIN)}
          </Text>
        ),
        labels: {
          confirm: __("Delete", TEXT_DOMAIN),
          cancel: __("Cancel", TEXT_DOMAIN),
        },
        confirmProps: { color: "red" },
        onConfirm: () => deleteOverrideMutation.mutate({ docId, sectionId }),
      });
    },
    [deleteOverrideMutation],
  );

  const formatDate = (dateString: string | null) => {
    if (!dateString) return __("Never", TEXT_DOMAIN);
    return new Date(dateString).toLocaleString();
  };

  const getSectionStatusBadge = (section: KBSection) => {
    if (section.needs_review) {
      return (
        <Badge size="sm" color="orange">
          {__("Needs Review", TEXT_DOMAIN)}
        </Badge>
      );
    }
    if (section.has_override) {
      return (
        <Badge size="sm" color="blue">
          {__("Overridden", TEXT_DOMAIN)}
        </Badge>
      );
    }
    return (
      <Badge size="sm" color="gray" variant="light">
        {__("Generated", TEXT_DOMAIN)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card withBorder shadow="sm">
        <Stack align="center" gap="md">
          <Loader size="md" />
          <Text>{__("Loading document...", TEXT_DOMAIN)}</Text>
        </Stack>
      </Card>
    );
  }

  return (
    <>
      <Card withBorder shadow="sm">
        <Stack gap="md">
          {/* Disabled source warning */}
          {!postData.source?.enabled && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title={__("KB Source Disabled", TEXT_DOMAIN)}
              color="orange"
            >
              <Text size="sm">
                {__(
                  "This KB source is currently disabled. You can view the content but cannot make changes. Re-enable the source from the KB Sources list to edit or regenerate content.",
                  TEXT_DOMAIN,
                )}
              </Text>
            </Alert>
          )}

          {/* Header with post info and close button */}
          <Group justify="space-between" wrap="nowrap">
            <div style={{ flex: 1 }}>
              <Title order={5}>{postData.post_title}</Title>
              <Text size="xs" c="dimmed">
                {__("Post ID:", TEXT_DOMAIN)} #{postData.post_id} •{" "}
                {__("Type:", TEXT_DOMAIN)} {postData.post_type} •{" "}
                {postData.post_status === "publish"
                  ? __("Live", TEXT_DOMAIN)
                  : __("Draft", TEXT_DOMAIN)}
              </Text>
              {postData.docs.length > 0 &&
                postData.docs.some((d) => d.publish_state) && (
                  <Group gap="xs" mt="xs">
                    <Text size="xs" fw={500}>
                      {__("KB Status:", TEXT_DOMAIN)}
                    </Text>
                    {postData.docs.map((doc) => {
                      if (!doc.publish_state) return null;
                      return (
                        <Badge
                          key={doc.doc_id}
                          size="sm"
                          color={
                            doc.publish_state.last_backend_status === "success"
                              ? "green"
                              : doc.publish_state.last_backend_status ===
                                "error"
                              ? "red"
                              : "gray"
                          }
                        >
                          {doc.doc_id.split("/").pop()}:{" "}
                          {doc.publish_state.last_backend_status === "success"
                            ? __("Published to KB", TEXT_DOMAIN)
                            : doc.publish_state.last_backend_status}
                        </Badge>
                      );
                    })}
                    <Text size="xs" c="dimmed">
                      {__("Last sync:", TEXT_DOMAIN)}{" "}
                      {formatDate(
                        postData.docs.find((d) => d.publish_state)
                          ?.publish_state?.last_published_at || "",
                      )}
                    </Text>
                  </Group>
                )}
            </div>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={onClose}
              aria-label={__("Close", TEXT_DOMAIN)}
            >
              <IconX size={20} />
            </ActionIcon>
          </Group>

          {/* Action buttons */}
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={14} />}
              onClick={() => regenerateMutation.mutate()}
              loading={regenerateMutation.isPending}
              disabled={!postData.source?.enabled}
            >
              {__("Regenerate", TEXT_DOMAIN)}
            </Button>
            {postData.docs.length > 0 && (
              <>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconCheck size={14} />}
                  onClick={() => {
                    modals.openConfirmModal({
                      title: __("Mark as Reviewed", TEXT_DOMAIN),
                      children: (
                        <Text size="sm">
                          {__(
                            "Mark all documents as reviewed and ready to publish?",
                            TEXT_DOMAIN,
                          )}
                        </Text>
                      ),
                      labels: {
                        confirm: __("Mark as Reviewed", TEXT_DOMAIN),
                        cancel: __("Cancel", TEXT_DOMAIN),
                      },
                      confirmProps: { color: "teal" },
                      onConfirm: () => approveMutation.mutate(),
                    });
                  }}
                  loading={approveMutation.isPending}
                  disabled={!postData.source?.enabled}
                >
                  {__("Mark as Reviewed", TEXT_DOMAIN)}
                </Button>
                <Button
                  size="xs"
                  leftSection={<IconSend size={14} />}
                  onClick={() => {
                    modals.openConfirmModal({
                      title: __("Publish to KB", TEXT_DOMAIN),
                      children: (
                        <Text size="sm">
                          {__(
                            "Are you sure you want to publish all documents to the Knowledge Base?",
                            TEXT_DOMAIN,
                          )}
                        </Text>
                      ),
                      labels: {
                        confirm: __("Publish to KB", TEXT_DOMAIN),
                        cancel: __("Cancel", TEXT_DOMAIN),
                      },
                      confirmProps: { color: "blue" },
                      onConfirm: () => publishMutation.mutate(),
                    });
                  }}
                  loading={publishMutation.isPending}
                  disabled={!postData.source?.enabled}
                >
                  {__("Publish to KB", TEXT_DOMAIN)}
                </Button>
              </>
            )}
          </Group>

          {/* No documents alert */}
          {postData.docs.length === 0 && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title={__("No documents generated", TEXT_DOMAIN)}
              color="orange"
            >
              <Text size="sm">
                {__(
                  "Click 'Regenerate' to generate KB documents from this post.",
                  TEXT_DOMAIN,
                )}
              </Text>
            </Alert>
          )}

          {/* Documents */}
          {postData.docs.length > 0 && <Divider />}
          {postData.docs.map((doc) => (
            <Paper
              key={doc.doc_id}
              p="md"
              withBorder
              style={{
                borderLeft: "4px solid var(--mantine-color-blue-6)",
              }}
            >
              <Stack gap="md">
                {(() => {
                  const docMetadata = getEffectiveDocumentMetadata(doc);

                  return (
                    <Group
                      justify="space-between"
                      align="flex-start"
                      wrap="nowrap"
                    >
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Group gap="xs">
                          <IconFile
                            size={18}
                            color="var(--mantine-color-blue-6)"
                          />
                          <Title order={5} c="blue">
                            {__("Document:", TEXT_DOMAIN)} {doc.doc_id}
                          </Title>
                          {docMetadata?.hasCustomMetadata && (
                            <Badge size="sm" color="teal" variant="light">
                              {__("Custom Metadata", TEXT_DOMAIN)}
                            </Badge>
                          )}
                        </Group>
                        {docMetadata && (
                          <Text size="xs" c="dimmed">
                            {docMetadata.hasCustomMetadata
                              ? __(
                                  docMetadata.isBaseDocument
                                    ? "Base metadata is overridden independently from the generated content."
                                    : "Document metadata is overridden independently from the generated content.",
                                  TEXT_DOMAIN,
                                )
                              : __(
                                  docMetadata.isBaseDocument
                                    ? "Base metadata currently follows the generated WordPress taxonomy values."
                                    : "Document metadata currently follows the generated section values.",
                                  TEXT_DOMAIN,
                                )}
                          </Text>
                        )}
                      </Stack>
                      {docMetadata && (
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconEdit size={14} />}
                            onClick={() => handleEditDocumentMetadata(doc)}
                            disabled={!postData.source?.enabled}
                          >
                            {docMetadata.isBaseDocument
                              ? __("Edit Base Metadata", TEXT_DOMAIN)
                              : __("Edit Document Metadata", TEXT_DOMAIN)}
                          </Button>
                        </Group>
                      )}
                    </Group>
                  );
                })()}

                {(() => {
                  const docMetadata = getEffectiveDocumentMetadata(doc);
                  if (!docMetadata) {
                    return null;
                  }

                  const hasVisibleMetadata =
                    !!docMetadata.title ||
                    !!docMetadata.description ||
                    !!docMetadata.postUrl ||
                    !!docMetadata.category ||
                    !!docMetadata.subcategory ||
                    docMetadata.tags.length > 0;

                  return (
                    <Paper
                      withBorder
                      p="sm"
                      radius="md"
                      bg="var(--mantine-color-gray-0)"
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="center">
                          <Text size="sm" fw={600}>
                            {docMetadata.isBaseDocument
                              ? __("Base Document Metadata", TEXT_DOMAIN)
                              : __("Document Metadata", TEXT_DOMAIN)}
                          </Text>
                          <Group gap="xs">
                            {docMetadata.hasCustomMetadata && (
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                onClick={() =>
                                  handleResetDocumentMetadata({
                                    docId: docMetadata.docId,
                                    sectionId: docMetadata.sectionId,
                                    isBaseDocument: docMetadata.isBaseDocument,
                                    locked: docMetadata.locked,
                                    overrideMd: docMetadata.overrideMd,
                                  })
                                }
                                disabled={!postData.source?.enabled}
                                loading={
                                  resetDocumentMetadataMutation.isPending
                                }
                              >
                                {__("Reset Metadata", TEXT_DOMAIN)}
                              </Button>
                            )}
                            {docMetadata.hasCustomMetadata && (
                              <Badge size="sm" color="teal" variant="dot">
                                {__("Override Active", TEXT_DOMAIN)}
                              </Badge>
                            )}
                          </Group>
                        </Group>

                        {hasVisibleMetadata ? (
                          <Group gap="md" align="stretch">
                            {docMetadata.title && (
                              <Stack
                                gap={2}
                                align="flex-start"
                                justify="flex-start"
                              >
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Document Title:", TEXT_DOMAIN)}
                                </Text>
                                <Badge size="sm" variant="light" color="grape">
                                  {docMetadata.title}
                                </Badge>
                              </Stack>
                            )}
                            {docMetadata.description && (
                              <Stack
                                gap={2}
                                align="flex-start"
                                justify="flex-start"
                                style={{ minWidth: 240, flex: 1 }}
                              >
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Description:", TEXT_DOMAIN)}
                                </Text>
                                <Text size="sm">{docMetadata.description}</Text>
                              </Stack>
                            )}
                            {docMetadata.postUrl && (
                              <Stack
                                gap={2}
                                align="flex-start"
                                justify="flex-start"
                                style={{ minWidth: 240, flex: 1 }}
                              >
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Source URL:", TEXT_DOMAIN)}
                                </Text>
                                <Text
                                  size="sm"
                                  component="a"
                                  href={docMetadata.postUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ wordBreak: "break-all" }}
                                >
                                  {docMetadata.postUrl}
                                </Text>
                              </Stack>
                            )}
                            {docMetadata.category && (
                              <Stack
                                gap={2}
                                align="flex-start"
                                justify="flex-start"
                              >
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Category:", TEXT_DOMAIN)}
                                </Text>
                                <Badge size="sm" variant="light">
                                  {docMetadata.category}
                                </Badge>
                              </Stack>
                            )}
                            {docMetadata.subcategory && (
                              <Stack
                                gap={2}
                                align="flex-start"
                                justify="flex-start"
                              >
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Subcategory:", TEXT_DOMAIN)}
                                </Text>
                                <Badge size="sm" variant="light" color="blue">
                                  {docMetadata.subcategory}
                                </Badge>
                              </Stack>
                            )}
                            {docMetadata.tags.length > 0 && (
                              <Stack
                                gap={2}
                                align="flex-start"
                                justify="flex-start"
                              >
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Tags:", TEXT_DOMAIN)}
                                </Text>
                                <Group gap="xs" align="center">
                                  {docMetadata.tags.map((tag) => (
                                    <Badge
                                      key={tag}
                                      size="sm"
                                      variant="outline"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </Group>
                              </Stack>
                            )}
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">
                            {__(
                              docMetadata.isBaseDocument
                                ? "No document title, description, source URL, category, subcategory, or tags are currently set for this base document."
                                : "No document title, description, source URL, category, subcategory, or tags are currently set for this document.",
                              TEXT_DOMAIN,
                            )}
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  );
                })()}

                {/* Sections */}
                <Accordion variant="contained">
                  {doc.sections.map((section) => (
                    <Accordion.Item
                      key={section.section_id}
                      value={section.section_id}
                    >
                      <Accordion.Control>
                        <Group justify="space-between" wrap="nowrap">
                          <div>
                            <Text size="sm" fw={500}>
                              {section.override?.override_meta?.title ||
                                section.title ||
                                section.section_id}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {__("Mode:", TEXT_DOMAIN)} {section.mode}
                            </Text>
                          </div>
                          {getSectionStatusBadge(section)}
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="md">
                          {section.needs_review && (
                            <Alert
                              icon={<IconAlertCircle size={16} />}
                              title={__("Review needed", TEXT_DOMAIN)}
                              color="orange"
                            >
                              <Text size="sm">
                                {__(
                                  "The source content has changed since this override was created. Please review and update.",
                                  TEXT_DOMAIN,
                                )}
                              </Text>
                            </Alert>
                          )}

                          {/* Metadata display */}
                          <Group gap="md">
                            {(section.override?.override_meta?.category ||
                              section.category) && (
                              <div>
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Category:", TEXT_DOMAIN)}
                                </Text>
                                <Badge size="sm" variant="light">
                                  {section.override?.override_meta?.category ||
                                    section.category}
                                </Badge>
                              </div>
                            )}
                            {(section.override?.override_meta?.subcategory ||
                              section.subcategory) && (
                              <div>
                                <Text size="xs" c="dimmed" mb={2}>
                                  {__("Subcategory:", TEXT_DOMAIN)}
                                </Text>
                                <Badge size="sm" variant="light" color="blue">
                                  {section.override?.override_meta
                                    ?.subcategory || section.subcategory}
                                </Badge>
                              </div>
                            )}
                          </Group>

                          <div>
                            <Text size="sm" fw={500} mb="xs">
                              {section.has_override
                                ? __("Override content:", TEXT_DOMAIN)
                                : __("Generated content:", TEXT_DOMAIN)}
                            </Text>
                            <Code block style={{ whiteSpace: "pre-wrap" }}>
                              {section.override?.override_md || section.md}
                            </Code>
                          </div>

                          {!section.has_override && (
                            <Text size="xs" c="dimmed">
                              {__("Generated at:", TEXT_DOMAIN)}{" "}
                              {formatDate(section.generated_at)}
                            </Text>
                          )}

                          {section.override && (
                            <Group gap="xs">
                              <Badge
                                size="sm"
                                leftSection={
                                  section.override.locked ? (
                                    <IconLock size={12} />
                                  ) : (
                                    <IconLockOpen size={12} />
                                  )
                                }
                                color={
                                  section.override.locked ? "blue" : "gray"
                                }
                              >
                                {section.override.locked
                                  ? __("Locked", TEXT_DOMAIN)
                                  : __("Unlocked", TEXT_DOMAIN)}
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {__("Updated:", TEXT_DOMAIN)}{" "}
                                {formatDate(section.override.updated_at)}
                              </Text>
                            </Group>
                          )}

                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconEdit size={14} />}
                              onClick={() =>
                                handleEditSection(doc.doc_id, section)
                              }
                              disabled={!postData.source?.enabled}
                            >
                              {section.has_override
                                ? __("Edit Override", TEXT_DOMAIN)
                                : __("Create Override", TEXT_DOMAIN)}
                            </Button>
                            {section.has_override && (
                              <Button
                                size="xs"
                                variant="light"
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                onClick={() =>
                                  handleDeleteOverride(
                                    doc.doc_id,
                                    section.section_id,
                                  )
                                }
                                loading={
                                  deleteOverrideMutation.isPending &&
                                  deleteOverrideMutation.variables?.docId ===
                                    doc.doc_id &&
                                  deleteOverrideMutation.variables
                                    ?.sectionId === section.section_id
                                }
                                disabled={!postData.source?.enabled}
                              >
                                {__("Delete Override", TEXT_DOMAIN)}
                              </Button>
                            )}
                          </Group>
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Card>

      {/* Edit modal */}
      <Modal
        opened={editModalOpened}
        onClose={closeEditModal}
        title={__("Edit Section Override", TEXT_DOMAIN)}
        size="xl"
      >
        <Stack gap="md">
          <Alert
            icon={<IconInfoCircle size={16} />}
            title={__("About overrides", TEXT_DOMAIN)}
            color="blue"
            variant="light"
          >
            <Text size="sm">
              {__(
                "Overriding a section locks it from automatic regeneration. If the source post changes, the section will be marked as 'Needs Review' so you can decide whether to update your override.",
                TEXT_DOMAIN,
              )}
            </Text>
          </Alert>
          <TextInput
            label={__("Title", TEXT_DOMAIN)}
            description={__(
              "Override the section title used in KB metadata. Leave empty to use the generated title.",
              TEXT_DOMAIN,
            )}
            placeholder={__("Custom section title...", TEXT_DOMAIN)}
            value={editingSection?.title || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setEditingSection((prev) =>
                prev ? { ...prev, title: value } : null,
              );
            }}
          />
          <Group grow>
            <TextInput
              label={__("Category", TEXT_DOMAIN)}
              description={__(
                "Override the category metadata for this section",
                TEXT_DOMAIN,
              )}
              placeholder={__("e.g. Getting Started", TEXT_DOMAIN)}
              value={editingSection?.category || ""}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditingSection((prev) =>
                  prev ? { ...prev, category: value } : null,
                );
              }}
            />
            <TextInput
              label={__("Subcategory", TEXT_DOMAIN)}
              description={__(
                "Override the subcategory metadata for this section",
                TEXT_DOMAIN,
              )}
              placeholder={__("e.g. Installation", TEXT_DOMAIN)}
              value={editingSection?.subcategory || ""}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditingSection((prev) =>
                  prev ? { ...prev, subcategory: value } : null,
                );
              }}
            />
          </Group>
          <TextInput
            label={__("Tags", TEXT_DOMAIN)}
            description={__(
              "Override tags for cross-cutting topics. Separate multiple tags with commas.",
              TEXT_DOMAIN,
            )}
            placeholder={__(
              "e.g. wordpress, plugins, configuration",
              TEXT_DOMAIN,
            )}
            value={editingSection?.tags?.join(", ") || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              const tags = value
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
              setEditingSection((prev) => (prev ? { ...prev, tags } : null));
            }}
          />
          <Textarea
            label={__("Markdown content", TEXT_DOMAIN)}
            description={__(
              "Edit the markdown content for this section. This will be used instead of the automatically generated content.",
              TEXT_DOMAIN,
            )}
            placeholder={__(
              "# Section Title\n\nYour markdown content here...",
              TEXT_DOMAIN,
            )}
            value={editingSection?.md || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setEditingSection((prev) =>
                prev ? { ...prev, md: value } : null,
              );
            }}
            minRows={10}
            maxRows={20}
            autosize
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeEditModal}>
              {__("Cancel", TEXT_DOMAIN)}
            </Button>
            <Button
              onClick={handleSaveOverride}
              loading={saveOverrideMutation.isPending}
              leftSection={<IconCheck size={16} />}
            >
              {__("Save Override", TEXT_DOMAIN)}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={documentMetadataModalOpened}
        onClose={closeDocumentMetadataModal}
        title={
          editingDocumentMetadata?.isBaseDocument
            ? __("Edit Base Document Metadata", TEXT_DOMAIN)
            : __("Edit Document Metadata", TEXT_DOMAIN)
        }
        size="lg"
      >
        <Stack gap="md">
          <Alert
            icon={<IconInfoCircle size={16} />}
            title={
              editingDocumentMetadata?.isBaseDocument
                ? __("About base document metadata", TEXT_DOMAIN)
                : __("About document metadata", TEXT_DOMAIN)
            }
            color="blue"
            variant="light"
          >
            <Text size="sm">
              {__(
                editingDocumentMetadata?.isBaseDocument
                  ? "These metadata values override the generated base document classification without locking the generated content. Automatic regeneration will continue unless the markdown itself has a locked override."
                  : "These metadata values override the generated document metadata without locking the generated content. Automatic regeneration will continue unless the markdown itself has a locked override.",
                TEXT_DOMAIN,
              )}
            </Text>
          </Alert>
          <Group grow>
            <TextInput
              label={__("Document Title", TEXT_DOMAIN)}
              description={__(
                editingDocumentMetadata?.isBaseDocument
                  ? "Override the title used for this generated base document."
                  : "Override the title used for this generated document.",
                TEXT_DOMAIN,
              )}
              placeholder={__(
                "Leave empty to use the generated title",
                TEXT_DOMAIN,
              )}
              value={editingDocumentMetadata?.preservedTitle || ""}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditingDocumentMetadata((prev) =>
                  prev
                    ? {
                        ...prev,
                        preservedTitle: value || undefined,
                      }
                    : null,
                );
              }}
            />
          </Group>
          <Textarea
            label={__("Description", TEXT_DOMAIN)}
            description={__(
              "Override the description stored in document metadata. Leave empty to use the source post excerpt.",
              TEXT_DOMAIN,
            )}
            placeholder={__(
              "Short summary shown in Doc Search results...",
              TEXT_DOMAIN,
            )}
            value={editingDocumentMetadata?.description || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setEditingDocumentMetadata((prev) =>
                prev
                  ? {
                      ...prev,
                      description: value || undefined,
                    }
                  : null,
              );
            }}
            minRows={3}
            autosize
          />
          <TextInput
            label={__("Source URL", TEXT_DOMAIN)}
            description={__(
              editingDocumentMetadata?.isBaseDocument
                ? "Override the source URL stored in metadata for this base document. Leave empty to use the Base URL Override or the WordPress site URL."
                : "Override the source URL stored in metadata for this document. Leave empty to inherit the base document URL when available.",
              TEXT_DOMAIN,
            )}
            placeholder={__("https://example.com/custom-page", TEXT_DOMAIN)}
            value={editingDocumentMetadata?.postUrl || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setEditingDocumentMetadata((prev) =>
                prev
                  ? {
                      ...prev,
                      postUrl: value || undefined,
                    }
                  : null,
              );
            }}
          />
          <Group grow>
            <TextInput
              label={__("Category", TEXT_DOMAIN)}
              description={__(
                editingDocumentMetadata?.isBaseDocument
                  ? "Set a KB category for the generated base document"
                  : "Set a KB category for the generated document",
                TEXT_DOMAIN,
              )}
              placeholder={__("e.g. Getting Started", TEXT_DOMAIN)}
              value={editingDocumentMetadata?.category || ""}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditingDocumentMetadata((prev) =>
                  prev ? { ...prev, category: value } : null,
                );
              }}
            />
            <TextInput
              label={__("Subcategory", TEXT_DOMAIN)}
              description={__(
                editingDocumentMetadata?.isBaseDocument
                  ? "Set a KB subcategory for the generated base document"
                  : "Set a KB subcategory for the generated document",
                TEXT_DOMAIN,
              )}
              placeholder={__("e.g. Installation", TEXT_DOMAIN)}
              value={editingDocumentMetadata?.subcategory || ""}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditingDocumentMetadata((prev) =>
                  prev ? { ...prev, subcategory: value } : null,
                );
              }}
            />
          </Group>
          <TagsInput
            label={__("Tags", TEXT_DOMAIN)}
            description={__(
              editingDocumentMetadata?.isBaseDocument
                ? "Set KB tags for the generated base document. Press Enter or comma to add a tag."
                : "Set KB tags for the generated document. Press Enter or comma to add a tag.",
              TEXT_DOMAIN,
            )}
            placeholder={__("Type a tag and press Enter...", TEXT_DOMAIN)}
            value={editingDocumentMetadata?.tags || []}
            onChange={(tags) => {
              setEditingDocumentMetadata((prev) =>
                prev ? { ...prev, tags } : null,
              );
            }}
            splitChars={[","]}
            acceptValueOnBlur
            clearable
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeDocumentMetadataModal}>
              {__("Cancel", TEXT_DOMAIN)}
            </Button>
            <Button
              onClick={handleSaveDocumentMetadata}
              loading={saveDocumentMetadataMutation.isPending}
              leftSection={<IconCheck size={16} />}
            >
              {__("Save Metadata", TEXT_DOMAIN)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

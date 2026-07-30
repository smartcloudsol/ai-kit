// KB Admin - Main Component
// Knowledge Base administration interface

import { Alert, Card, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconBook, IconInfoCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useState } from "react";

import { resolveBackend, TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import KBConfigEditor from "./KBConfigEditor.tsx";
import KBSettings from "./KBSettings.tsx";
import KBSourceList from "./KBSourceList.tsx";

interface KBAdminEditorProps {
  accountId: string;
  siteId: string;
  siteKey: string;
  InfoLabel: (props: {
    text: string;
    scrollToId: string;
    onOpen: (targetScrollToId: string) => void;
  }) => JSX.Element;
  openInfo: (targetScrollToId: string) => void;
}

export default function KBAdminEditor({
  accountId,
  siteId,
  InfoLabel,
  openInfo,
}: KBAdminEditorProps) {
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);

  // Check backend availability
  const {
    data: backendConfig,
    isLoading: isLoadingBackend,
    error: backendError,
  } = useQuery({
    queryKey: ["kb-admin-backend"],
    queryFn: resolveBackend,
  });

  // Sources are now fetched directly in KBSourceList with pagination
  const isLoading = isLoadingBackend;

  if (isLoading) {
    return (
      <Card withBorder shadow="sm" p="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>{__("Loading KB Admin...", TEXT_DOMAIN)}</Text>
        </Stack>
      </Card>
    );
  }

  if (backendError || !backendConfig?.available) {
    return (
      <Card withBorder shadow="sm">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title={__("Backend not available", TEXT_DOMAIN)}
          color="red"
        >
          <Text size="sm">
            {__(
              "KB Admin requires a configured backend. Please configure API settings first.",
              TEXT_DOMAIN,
            )}
          </Text>
          {backendConfig?.reason && (
            <Text size="xs" mt="xs" c="dimmed">
              {__("Reason:", TEXT_DOMAIN)} {backendConfig.reason}
            </Text>
          )}
        </Alert>
      </Card>
    );
  }

  return (
    <Stack gap="md" style={{ maxWidth: 1280 }}>
      <Card withBorder shadow="sm">
        <Stack gap="md">
          <Group align="flex-start" justify="space-between">
            <div>
              <Title order={4}>
                <Group gap="xs">
                  <IconBook size={20} />
                  <InfoLabel
                    text={__("Knowledge Base Admin", TEXT_DOMAIN)}
                    scrollToId="kb-admin-overview"
                    onOpen={openInfo}
                  />
                </Group>
              </Title>
              <Text size="sm" c="dimmed" mt="xs">
                {__(
                  "Manage posts as knowledge base sources. Enable posts to generate and publish KB documents to the backend.",
                  TEXT_DOMAIN,
                )}
              </Text>
            </div>
          </Group>

          <Alert
            icon={<IconInfoCircle size={16} />}
            title={__("How it works", TEXT_DOMAIN)}
            color="blue"
            variant="light"
          >
            <Stack gap="xs">
              <Text size="sm">
                {__("1. Enable any post/page as a KB source", TEXT_DOMAIN)}
              </Text>
              <Text size="sm">
                {__(
                  "2. The system generates markdown from post content",
                  TEXT_DOMAIN,
                )}
              </Text>
              <Text size="sm">
                {__(
                  "3. You can override sections with custom content",
                  TEXT_DOMAIN,
                )}
              </Text>
              <Text size="sm">
                {__(
                  "4. Publish documents to make them available in the backend",
                  TEXT_DOMAIN,
                )}
              </Text>
            </Stack>
          </Alert>
        </Stack>
      </Card>

      <KBSettings InfoLabel={InfoLabel} openInfo={openInfo} />

      <KBSourceList
        selectedPostId={selectedPostId}
        onSelectPost={setSelectedPostId}
        accountId={accountId}
        siteId={siteId}
        backendAvailable={backendConfig?.available ?? false}
        InfoLabel={InfoLabel}
        openInfo={openInfo}
      />

      <KBConfigEditor InfoLabel={InfoLabel} openInfo={openInfo} />
    </Stack>
  );
}

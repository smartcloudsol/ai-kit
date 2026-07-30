// KB Settings Component
// Manages Knowledge Base configuration options

import {
  Alert,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck, IconSettings } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import { fetchKBSettings, updateKBSettings } from "./api-client";
import type { KBSettings as KBSettingsType } from "./types";

interface KBSettingsProps {
  InfoLabel: (props: {
    text: string;
    scrollToId: string;
    onOpen: (targetScrollToId: string) => void;
  }) => JSX.Element;
  openInfo: (targetScrollToId: string) => void;
}

export default function KBSettings({ InfoLabel, openInfo }: KBSettingsProps) {
  const [editedValue, setEditedValue] = useState<string | null>(null);

  // Fetch current settings
  const {
    data: settings,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["kb-settings"],
    queryFn: fetchKBSettings,
  });

  const currentValue =
    editedValue !== null ? editedValue : settings?.base_url_override || "";
  const hasChanges =
    editedValue !== null && editedValue !== (settings?.base_url_override || "");

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: (data: Partial<KBSettingsType>) => updateKBSettings(data),
    onSuccess: () => {
      notifications.show({
        title: __("Success", TEXT_DOMAIN),
        message: __("Settings saved successfully", TEXT_DOMAIN),
        color: "green",
        icon: <IconCheck />,
      });
      // Clear edited state after successful save
      setEditedValue(null);
      refetch();
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

  const handleSave = () => {
    if (editedValue !== null) {
      saveMutation.mutate({
        base_url_override: editedValue,
      });
    }
  };

  return (
    <Card withBorder shadow="sm">
      <Stack gap="md">
        <Group align="flex-start" justify="space-between">
          <div>
            <Title order={5}>
              <Group gap="xs">
                <IconSettings size={18} />
                <InfoLabel
                  text={__("KB Settings", TEXT_DOMAIN)}
                  scrollToId="kb-settings-base-url"
                  onOpen={openInfo}
                />
              </Group>
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              {__(
                "Configure knowledge base options and URL overrides.",
                TEXT_DOMAIN,
              )}
            </Text>
          </div>
        </Group>

        <TextInput
          label={
            <InfoLabel
              text={__("Base URL Override", TEXT_DOMAIN)}
              scrollToId="kb-settings-base-url"
              onOpen={openInfo}
            />
          }
          description={__(
            "Optional: Override the WordPress site URL in source links embedded in KB documents. Leave empty to use the default WordPress site URL. This is useful when your development environment URL differs from your production URL.",
            TEXT_DOMAIN,
          )}
          placeholder="https://example.com"
          value={currentValue}
          onChange={(e) => setEditedValue(e.currentTarget.value)}
          disabled={isLoading || saveMutation.isPending}
        />

        <Alert
          icon={<IconAlertCircle size={16} />}
          title={__("Example use case", TEXT_DOMAIN)}
          color="blue"
          variant="light"
        >
          <Text size="sm">
            {__(
              "If you're developing on localhost (http://localhost:10004) but deploying to production (https://example.com), set the base URL override to ensure source links point to the production site.",
              TEXT_DOMAIN,
            )}
          </Text>
        </Alert>

        <Group justify="flex-end">
          <Button
            onClick={handleSave}
            loading={saveMutation.isPending}
            disabled={!hasChanges || isLoading}
          >
            {__("Save Settings", TEXT_DOMAIN)}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

import { useState, useCallback } from "react";
import { Alert, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

const LOCAL_STORAGE_KEY = "ai-kit_noregistration_required_dismissed";

const dismissed = localStorage.getItem(LOCAL_STORAGE_KEY);

export const NoRegistrationRequiredBanner = () => {
  const [visible, setVisible] = useState(!dismissed);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, "true");
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    visible && (
      <Alert
        color="green"
        title="No Registration Required"
        icon={<IconInfoCircle />}
        w="100%"
        withCloseButton
        onClose={handleDismiss}
      >
        <Text size="sm" mb="xs">
          <strong>
            All essential features work out of the box without registration.
          </strong>{" "}
          Premium options become available after connecting your site and choosing a plan.
        </Text>
        <Text size="sm">
          Enjoy a <strong>14-day free trial</strong> with full access —{" "}
          <strong>no credit card required</strong>. See our{" "}
          <a
            href="https://wpsuite.io/pricing/"
            target="_blank"
            rel="noreferrer"
          >
            pricing page
          </a>{" "}
          for details.
        </Text>
      </Alert>
    )
  );
};

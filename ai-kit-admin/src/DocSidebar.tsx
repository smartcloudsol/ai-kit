import { Anchor, Code, Drawer, List, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef } from "react";
import classes from "./main.module.css";

const pages = {
  general: (
    <>
      <Title order={2}>AI-Kit settings</Title>
      <Text>
        This sidebar explains the options available on the AI-Kit admin screen.
        Click the <strong>info</strong> icon next to any field to jump to its
        description here.
      </Text>
      <Title order={3} mt="md" id="shared-context">
        <span className="highlightable">Shared context</span>
      </Title>
      <Text>
        Optional. A global piece of context that AI-Kit sends along with your AI
        requests. Use it to enforce your preferred style and constraints across
        the whole site.
      </Text>
      <Text mt="xs">
        <strong>Language tip:</strong> write this either in your site’s frontend
        language or in English. If you generate content in multiple languages
        (for example with Write, Rewrite, or SEO metadata), keep the shared
        context in <strong>English</strong> to stay consistent across languages
        and avoid confusing the model.
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          Example: <Code>Write in a friendly, concise tone. Avoid hype.</Code>
        </List.Item>
        <List.Item>
          Example: <Code>Use British English and our brand terminology.</Code>
        </List.Item>
      </List>
      <Title order={3} mt="md" id="default-output-language">
        <span className="highlightable">Default output language</span>
      </Title>
      <Text>
        Sets the preferred language for AI-generated text (where applicable). If
        you don’t change it, AI-Kit defaults to <strong>English</strong>. This
        is useful on multilingual sites, or when the browser/back-end can’t
        reliably infer what language the output should be.
      </Text>{" "}
      <Title order={3} mt="md" id="recaptcha-site-key">
        <span className="highlightable">Google reCAPTCHA (v3) site key</span>
      </Title>
      <Text>
        Optional. Adds bot protection for AI-triggered actions (for example
        operations initiated from the editor UI). Create a v3 key in Google
        reCAPTCHA or reCAPTCHA Enterprise and paste the <em>site key</em> here.
      </Text>
      <Title order={3} mt="md" id="use-recaptcha-enterprise">
        <span className="highlightable">Use reCAPTCHA Enterprise</span>
      </Title>
      <Text>
        Enable this if your site key was generated in{" "}
        <Anchor
          href="https://console.cloud.google.com/security/recaptcha"
          target="_blank"
          rel="noreferrer"
        >
          reCAPTCHA Enterprise
        </Anchor>
        . Leave it off for classic reCAPTCHA v3.
      </Text>
      <Title order={3} mt="md" id="use-recaptcha-net">
        <span className="highlightable">Use recaptcha.net</span>
      </Title>
      <Text>
        When enabled, the reCAPTCHA script is loaded from{" "}
        <Code>recaptcha.net</Code> instead of <Code>google.com</Code>. This is
        useful in regions where <Code>google.com</Code> may be blocked.
      </Text>
      <Title order={3} mt="md" id="hide-powered-by-ai-kit">
        <span className="highlightable">Hide “Powered by AI-Kit”</span>
      </Title>
      <Text>
        Controls whether AI-Kit shows a small attribution link in places where
        AI-Kit renders UI (where applicable). You can hide it for a cleaner
        appearance.
      </Text>
    </>
  ),

  "api-settings": (
    <>
      <Title order={2} id="api-settings">
        <span className="highlightable">API Settings</span>
      </Title>
      <Text>
        Configure how AI-Kit reaches its backend for AI features (for example
        chat, summarization, and image metadata generation). You can run fully
        local, use the backend as a fallback, or force backend-only execution.
      </Text>

      <Title order={3} mt="md" id="aikit-api-mode">
        <span className="highlightable">Mode</span>
      </Title>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          <strong>Local only</strong>: AI-Kit will not call the backend.
        </List.Item>
        <List.Item>
          <strong>Backend fallback</strong>: try local first, then call the
          backend if local is unavailable.
        </List.Item>
        <List.Item>
          <strong>Backend only</strong>: always call the backend.
        </List.Item>
      </List>

      <Title order={3} mt="md" id="aikit-api-backend-transport">
        <span className="highlightable">Backend transport</span>
      </Title>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          <strong>Gatey / Amplify</strong>: uses REST API names from the Amplify
          configuration exposed by Gatey (read from{" "}
          <Code>getAmplifyConfig().API.REST</Code>).
        </List.Item>
        <List.Item>
          <strong>Fetch (base URL)</strong>: calls your backend directly using a
          base URL (useful for custom endpoints or non-Amplify setups).
        </List.Item>
      </List>

      <Title order={3} mt="md" id="aikit-api-backend-api-name">
        <span className="highlightable">Backend API name</span>
      </Title>
      <Text>
        Shown when using <strong>Gatey / Amplify</strong>. Select one of the
        REST API keys found in <Code>getAmplifyConfig().API.REST</Code>.
      </Text>

      <Title order={3} mt="md" id="aikit-api-backend-base-url">
        <span className="highlightable">Backend base URL</span>
      </Title>
      <Text>
        Shown when using <strong>Fetch (base URL)</strong>. Provide the base URL
        of your backend, e.g.{" "}
        <Code>https://xyz.execute-api.eu-central-1.amazonaws.com/prod</Code>.
      </Text>
    </>
  ),
};

interface DocSidebarProps {
  opened: boolean;
  close: () => void;
  page: keyof typeof pages;
  scrollToId: string;
}

export default function DocSidebar({
  opened,
  close,
  page,
  scrollToId,
}: DocSidebarProps) {
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (scrollHighlightTimeoutRef.current) {
      clearTimeout(scrollHighlightTimeoutRef.current);
      scrollHighlightTimeoutRef.current = null;
    }
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    document
      .querySelectorAll(classes["highlighted-doc-item"])
      .forEach((el) => el.classList.remove(classes["highlighted-doc-item"]));

    if (!opened || !scrollToId) {
      return;
    }

    scrollHighlightTimeoutRef.current = setTimeout(() => {
      const targetElement = document.getElementById(scrollToId);

      if (!targetElement) {
        scrollHighlightTimeoutRef.current = null;
        return;
      }

      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      const highlightableEl = targetElement.querySelector(".highlightable");

      if (highlightableEl) {
        highlightableEl.classList.add(classes["highlighted-doc-item"]);

        highlightTimeoutRef.current = setTimeout(() => {
          highlightableEl.classList.remove(classes["highlighted-doc-item"]);
          highlightTimeoutRef.current = null;
        }, 2000);
      }

      scrollHighlightTimeoutRef.current = null;
    }, 0);

    return () => {
      if (scrollHighlightTimeoutRef.current) {
        clearTimeout(scrollHighlightTimeoutRef.current);
        scrollHighlightTimeoutRef.current = null;
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      document
        .querySelectorAll(classes["highlighted-doc-item"])
        .forEach((el) => el.classList.remove(classes["highlighted-doc-item"]));
    };
  }, [opened, scrollToId]);

  return (
    <Drawer
      opened={opened}
      onClose={close}
      position="right"
      title="Help"
      zIndex={999999}
    >
      <Stack>{pages[page]}</Stack>
    </Drawer>
  );
}

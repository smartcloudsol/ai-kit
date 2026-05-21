import {
  Accordion,
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconPhoto,
  IconX,
} from "@tabler/icons-react";
import { __ } from "@wordpress/i18n";
import { useCallback, useMemo, useState } from "react";

import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

import classes from "./onboarding.module.css";

const LOCAL_STORAGE_KEY = "ai-kit_onboarding_collapsed";

function readCollapsedFromStorage(): boolean {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsedToStorage(value: boolean) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore
  }
}

export type OnboardingScreenshot = {
  title: string;
  src?: string;
  alt?: string;
};

export type AiKitOnboardingScreenshots = Partial<{
  media: OnboardingScreenshot[];
  sidebar: OnboardingScreenshot[];
  toolbar: OnboardingScreenshot[];
  imagePanel: OnboardingScreenshot[];
  proBlock: OnboardingScreenshot[];
  shortcode: OnboardingScreenshot[];
  api: OnboardingScreenshot[];
}>;

export type AiKitOnboardingProps = {
  screenshots?: AiKitOnboardingScreenshots;
};

function ScreenshotGallery(props: {
  items: OnboardingScreenshot[];
  emptyHint: string;
}) {
  const { items, emptyHint } = props;
  const [opened, { open, close }] = useDisclosure(false);
  const [active, setActive] = useState<OnboardingScreenshot | null>(null);

  const openShot = useCallback(
    (shot: OnboardingScreenshot) => {
      if (!shot?.src) return;
      setActive(shot);
      open();
    },
    [open],
  );

  if (!items?.length) {
    return (
      <Text size="sm" c="dimmed">
        {emptyHint}
      </Text>
    );
  }

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        {items.map((shot, idx) => {
          const clickable = Boolean(shot.src);
          return (
            <Card
              key={`${shot.title}-${idx}`}
              withBorder
              padding="sm"
              className={classes.thumbCard}
              onClick={clickable ? () => openShot(shot) : undefined}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              <Stack gap={6}>
                {shot.src ? (
                  <Image
                    src={shot.src}
                    alt={shot.alt || shot.title}
                    radius="sm"
                    className={classes.thumbImage}
                  />
                ) : (
                  <div className={classes.thumbPlaceholder}>
                    <IconPhoto size={18} />
                    <Text size="xs" c="dimmed">
                      {__("Add screenshot", TEXT_DOMAIN)}
                    </Text>
                  </div>
                )}
                <Text size="xs" fw={600} lineClamp={2}>
                  {shot.title}
                </Text>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>

      <Modal
        opened={opened}
        onClose={close}
        size="75rem"
        p="5rem"
        title={active?.title}
        centered
      >
        {active?.src && (
          <Image
            src={active.src}
            alt={active.alt || active.title}
            radius="md"
          />
        )}
      </Modal>
    </>
  );
}

export const AiKitOnboarding = (props: AiKitOnboardingProps) => {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readCollapsedFromStorage(),
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      writeCollapsedToStorage(next);
      return next;
    });
  }, []);

  const defaultShots = useMemo(() => {
    const shots = props.screenshots ?? {};
    const mk = (titles: string[]): OnboardingScreenshot[] =>
      titles.map((t) => ({ title: t }));

    return {
      sidebar:
        shots.sidebar ??
        mk([
          "Gutenberg: AI-Kit Sidebar → Generate post metadata",
          "Gutenberg: AI-Kit Sidebar → Text generation",
        ]),
      media:
        shots.media ??
        mk([
          "Media Library: Grid → attachment popup (SEO box)",
          "Media Library: Grid → bulk select (generate / preview)",
          "Attachment edit screen (post.php): SEO metadata box",
        ]),
      toolbar:
        shots.toolbar ??
        mk([
          "Gutenberg: Select text → AI-Kit Tools toolbar dropdown",
          "Example: Proofread modal",
          "Example: Rewrite modal",
          "Example: Translate modal",
        ]),
      imagePanel:
        shots.imagePanel ??
        mk(["Gutenberg: Image/Cover/Media-Text → SEO metadata generation"]),
      proBlock:
        shots.proBlock ??
        mk([
          "AI-Kit Feature (PRO) block: front-end buttons",
          "AI-Kit Feature (PRO) block: inspector options",
        ]),
      shortcode:
        shots.shortcode ??
        mk(["[smartcloud-ai-kit-feature] shortcode embedded in a page"]),
      api:
        shots.api ??
        mk([
          "Using WpSuite.plugins.aiKit.features.* in custom code",
          "Example: renderFeature() injecting a UI into the front-end",
        ]),
    } satisfies Required<AiKitOnboardingScreenshots>;
  }, [props.screenshots]);

  return (
    <Card withBorder mt="md" maw={1280} className={classes.container}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div className={classes.headerText}>
          <Title order={3} className={classes.title}>
            {__("Quick tour", TEXT_DOMAIN)}
          </Title>
          <Text size="sm" c="dimmed">
            {__(
              "A fast overview of what AI‑Kit unlocks inside WordPress — click a section to preview the UI.",
              TEXT_DOMAIN,
            )}
          </Text>
        </div>

        <Group gap="xs" wrap="nowrap">
          <Button
            variant={collapsed ? "light" : "subtle"}
            leftSection={
              collapsed ? (
                <IconChevronDown size={16} />
              ) : (
                <IconChevronUp size={16} />
              )
            }
            onClick={toggleCollapsed}
          >
            {collapsed ? __("Show", TEXT_DOMAIN) : __("Collapse", TEXT_DOMAIN)}
          </Button>
          {!collapsed && (
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={toggleCollapsed}
              aria-label={__("Dismiss", TEXT_DOMAIN)}
              title={__("Dismiss", TEXT_DOMAIN)}
            >
              <IconX size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>

      {collapsed ? (
        <Text size="sm" c="dimmed" mt="sm">
          {__(
            "This tour is currently collapsed. Click Show to expand it anytime.",
            TEXT_DOMAIN,
          )}
        </Text>
      ) : (
        <Accordion variant="separated" mt="md" defaultValue="sidebar">
          <Accordion.Item value="sidebar">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>
                  {__(
                    "Gutenberg Sidebar: Post metadata & writing",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <Badge variant="light">{__("Editor", TEXT_DOMAIN)}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "Use the AI-Kit Sidebar while editing posts/pages to generate post metadata and create or refine text with AI.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <ul className={classes.bullets}>
                  <li>
                    {__(
                      "Generate SEO post metadata (title / excerpt / etc.)",
                      TEXT_DOMAIN,
                    )}
                  </li>
                  <li>
                    {__(
                      "Write, rewrite, summarize, translate — with an Apply/Insert flow",
                      TEXT_DOMAIN,
                    )}
                  </li>
                </ul>

                <ScreenshotGallery
                  items={defaultShots.sidebar}
                  emptyHint={__(
                    "Add 1–2 screenshots from the sidebar panels.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="media">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>
                  {__("Media Library: Image SEO metadata", TEXT_DOMAIN)}
                </Text>
                <Badge variant="light">{__("Admin", TEXT_DOMAIN)}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "Generate SEO-friendly image metadata (alt text, title, caption, description) directly from the Media Library — both per-item and in bulk.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <ul className={classes.bullets}>
                  <li>{__("Works in Grid and List views", TEXT_DOMAIN)}</li>
                  <li>
                    {__(
                      "Supports attachment popup + attachment edit screen",
                      TEXT_DOMAIN,
                    )}
                  </li>
                  <li>
                    {__("Bulk generation and preview supported", TEXT_DOMAIN)}
                  </li>
                </ul>

                <ScreenshotGallery
                  items={defaultShots.media}
                  emptyHint={__(
                    "Tip: add 2–4 screenshots for Grid, List, Attachment screen, and Bulk flow.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="toolbar">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>
                  {__(
                    "Inline text tools: Proofread / Rewrite / Translate",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <Badge variant="light">{__("Editor", TEXT_DOMAIN)}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "Select any editable text in Gutenberg to access quick actions from a compact toolbar group.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <ul className={classes.bullets}>
                  <li>
                    {__("Proofread: fast fixes and suggestions", TEXT_DOMAIN)}
                  </li>
                  <li>{__("Rewrite: tone/length variants", TEXT_DOMAIN)}</li>
                  <li>
                    {__("Translate: choose target language", TEXT_DOMAIN)}
                  </li>
                </ul>

                <ScreenshotGallery
                  items={defaultShots.toolbar}
                  emptyHint={__(
                    "Add a screenshot of the toolbar dropdown + one modal.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="imagePanel">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>
                  {__("Image blocks: SEO Metadata panel", TEXT_DOMAIN)}
                </Text>
                <Badge variant="light">{__("Editor", TEXT_DOMAIN)}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "A dedicated SEO Metadata panel appears for core/image, core/cover and core/media-text blocks — so you can generate image metadata without leaving the editor.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <ul className={classes.bullets}>
                  <li>{__("Works from Inspector Controls", TEXT_DOMAIN)}</li>
                  <li>
                    {__(
                      "Uses the same metadata generator as Media Library",
                      TEXT_DOMAIN,
                    )}
                  </li>
                </ul>

                <ScreenshotGallery
                  items={defaultShots.imagePanel}
                  emptyHint={__(
                    "Add 1–2 screenshots of the panel in action.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="proBlock">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>{__("AI‑Kit Feature block", TEXT_DOMAIN)}</Text>
                <Badge color="violet" variant="light">
                  {__("PRO", TEXT_DOMAIN)}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "Add front-end buttons that let visitors run AI actions (write, rewrite, summarize, translate, proofread) on selected content.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <ul className={classes.bullets}>
                  <li>
                    {__(
                      "Multiple modes: summarize / write / rewrite / translate / proofread",
                      TEXT_DOMAIN,
                    )}
                  </li>
                  <li>
                    {__(
                      "Configurable inputs/outputs, language, UI variation, and overrides",
                      TEXT_DOMAIN,
                    )}
                  </li>
                </ul>

                <ScreenshotGallery
                  items={defaultShots.proBlock}
                  emptyHint={__(
                    "Add one front-end screenshot + one inspector screenshot.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="shortcode">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>
                  {__("Shortcode: [smartcloud-ai-kit-feature]", TEXT_DOMAIN)}
                </Text>
                <Badge color="violet" variant="light">
                  {__("PRO", TEXT_DOMAIN)}
                </Badge>
                <Badge variant="light">{__("Front-end", TEXT_DOMAIN)}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "Use the shortcode to bring the same feature UI to other editors or templating systems.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <Text size="sm" c="dimmed">
                  <code>[smartcloud-ai-kit-feature]</code>
                </Text>
                <ul className={classes.bullets}>
                  <li>
                    {__(
                      "Supports most block attributes as shortcode params",
                      TEXT_DOMAIN,
                    )}
                  </li>
                  <li>
                    {__(
                      "Works in classic editor, builders, or templates",
                      TEXT_DOMAIN,
                    )}
                  </li>
                </ul>

                <ScreenshotGallery
                  items={defaultShots.shortcode}
                  emptyHint={__(
                    "Add 1–2 screenshots of shortcode output on a page.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="api">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={700}>
                  {__(
                    "Developer API: WpSuite.plugins.aiKit.features",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <Badge variant="light">
                  {__("Extensibility", TEXT_DOMAIN)}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="sm">
                  {__(
                    "Integrate AI‑Kit capabilities into your own plugins: call write/rewrite/proofread/summarize/translate, or render an interactive feature UI programmatically.",
                    TEXT_DOMAIN,
                  )}
                </Text>
                <ul className={classes.bullets}>
                  <li>
                    <code>WpSuite.plugins.aiKit.features.write()</code>,{" "}
                    <code>rewrite()</code>, <code>proofread()</code>,{" "}
                    <code>summarize()</code>
                  </li>
                  <li>
                    <code>translate()</code>, <code>detectLanguage()</code>,{" "}
                    <code>prompt()</code>
                  </li>
                  <li>
                    <code>renderFeature()</code>{" "}
                    {__("to mount a UI into a target element", TEXT_DOMAIN)}
                  </li>
                </ul>

                <Group gap="xs">
                  <Anchor
                    href="https://wpsuite.io"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {__("Docs & examples", TEXT_DOMAIN)}{" "}
                    <IconExternalLink size={14} />
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {__(
                      "(Link can be updated to your AI‑Kit docs page)",
                      TEXT_DOMAIN,
                    )}
                  </Text>
                </Group>

                <ScreenshotGallery
                  items={defaultShots.api}
                  emptyHint={__(
                    "Optional: add one code screenshot and one UI-injection screenshot.",
                    TEXT_DOMAIN,
                  )}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </Card>
  );
};

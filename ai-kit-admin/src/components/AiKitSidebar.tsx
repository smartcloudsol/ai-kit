import { rawHandler } from "@wordpress/blocks";
import {
  Button,
  Notice,
  PanelBody,
  SelectControl,
  TextControl,
} from "@wordpress/components";
import { select, useDispatch } from "@wordpress/data";
import { PluginSidebar, PluginSidebarMoreMenuItem } from "@wordpress/editor";
import { __ } from "@wordpress/i18n";
import { registerPlugin } from "@wordpress/plugins";
import { Fragment, useCallback, useMemo, useState } from "react";

import {
  AiKitFeatureIcon,
  AiKitLanguageCode,
  getAiKitPlugin,
  LANGUAGE_OPTIONS,
  TEXT_DOMAIN,
  type WriteArgs,
} from "@smart-cloud/ai-kit-core";

import { readDefaultOutputLanguage } from "@smart-cloud/ai-kit-ui";

import { mdToGutenberg } from "./utils";

const SidebarInner = () => {
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [instructions, setInstructions] = useState("");
  const [tone, setTone] = useState<NonNullable<WriteArgs["tone"]>>("neutral");
  const [length, setLength] =
    useState<NonNullable<WriteArgs["length"]>>("short");
  const [outputLang, setOutputLang] = useState<AiKitLanguageCode | "">("");

  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string>();

  // SEO modal state
  const [seoModalOpen, setSeoModalOpen] = useState(false);
  const [seoOpenError, setSeoOpenError] = useState<string>();

  const { insertBlocks } = useDispatch("core/block-editor") as {
    insertBlocks: (blocks: unknown[]) => void;
  };

  const { editPost } = useDispatch("core/editor") as {
    editPost: (edits: Record<string, unknown>) => void;
  };

  const canGenerate = useMemo(() => topic.trim().length > 0, [topic]);

  const acceptInsert = useCallback(
    (generated: unknown) => {
      try {
        const HTML = mdToGutenberg(generated as string);
        const blocks = rawHandler({ HTML });
        insertBlocks(blocks);
        setModalOpen(false);
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : __("Unknown error", TEXT_DOMAIN);
        setError(msg);
      }
    },
    [insertBlocks],
  );

  const acceptSeo = useCallback(
    (generated: { title?: string; excerpt?: string }) => {
      const edits: Record<string, unknown> = {
        title: generated.title,
        excerpt: generated.excerpt,
      };
      editPost(edits);
      setSeoModalOpen(false);
    },
    [editPost],
  );

  return (
    <>
      <PanelBody title={__("SEO metadata", TEXT_DOMAIN)} initialOpen>
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          {__(
            "Generate a suggested title and excerpt (meta description) for the current post.",
            TEXT_DOMAIN,
          )}
        </p>

        <SelectControl
          label={__("Output language", TEXT_DOMAIN)}
          value={outputLang}
          options={[
            { label: __("Default (settings)", TEXT_DOMAIN), value: "" },
            ...LANGUAGE_OPTIONS,
          ]}
          onChange={(v) => setOutputLang(v)}
        />

        <Button
          variant="secondary"
          onClick={() => {
            setSeoOpenError(undefined);
            const editor = select("core/editor") as unknown as {
              getEditedPostContent?: () => string;
              getEditedPostAttribute?: (key: string) => unknown;
            };
            const noComments = (editor.getEditedPostContent?.() ?? "").replace(
              /<!--[\s\S]*?-->/g,
              "",
            );

            // HTML -> DOM -> text
            const doc = new DOMParser().parseFromString(
              noComments,
              "text/html",
            );
            doc
              .querySelectorAll("script,style,noscript")
              .forEach((n) => n.remove());

            const text = (doc.body?.textContent ?? "")
              .replace(/\r/g, "")
              .replace(/[ \t]+\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .replace(/[ \t]{2,}/g, " ")
              .trim();
            setContent(text);
            setSeoModalOpen(true);
          }}
        >
          {__("Generate SEO metadata", TEXT_DOMAIN)}
        </Button>

        {seoOpenError ? (
          <>
            <div style={{ marginTop: "12px" }}></div>
            <Notice
              status="error"
              isDismissible={true}
              onDismiss={() => setSeoOpenError(undefined)}
            >
              {seoOpenError}
            </Notice>
          </>
        ) : null}

        {seoModalOpen && (
          <div
            ref={async (ref) => {
              if (!ref) return;
              getAiKitPlugin()
                .features.renderFeature({
                  colorMode: "light",
                  primaryColor: "blue",
                  context: "admin",
                  store: await getAiKitPlugin().features.store,
                  target: ref!,
                  mode: "generatePostMetadata",
                  default: {
                    text: content,
                    outputLanguage: outputLang as AiKitLanguageCode,
                  },
                  variation: "modal",
                  title: __("Metadata generation", TEXT_DOMAIN),
                  onClose: () => {
                    setSeoModalOpen(false);
                  },
                  onAccept: acceptSeo as (args: unknown) => void,
                  acceptButtonTitle: __("Apply to post", TEXT_DOMAIN),
                })
                .catch((error) => {
                  console.error(error.message);
                  setSeoModalOpen(false);
                  setSeoOpenError(__(error.message, TEXT_DOMAIN));
                });
            }}
          ></div>
        )}
      </PanelBody>
      <PanelBody title={__("Text generation", TEXT_DOMAIN)} initialOpen>
        <TextControl
          label={__("Topic", TEXT_DOMAIN)}
          value={topic}
          onChange={(v?: string) => setTopic(v ?? "")}
          placeholder={__("What should the AI write about?", TEXT_DOMAIN)}
        />

        <TextControl
          label={__("Instructions", TEXT_DOMAIN)}
          value={instructions}
          onChange={(v?: string) => setInstructions(v ?? "")}
          placeholder={__(
            "Optional: style, audience, structure...",
            TEXT_DOMAIN,
          )}
        />

        <SelectControl
          label={__("Output language", TEXT_DOMAIN)}
          value={outputLang}
          options={[
            { label: __("Default (settings)", TEXT_DOMAIN), value: "" },
            ...LANGUAGE_OPTIONS,
          ]}
          onChange={(v) => setOutputLang(v)}
        />

        <SelectControl
          label={__("Tone", TEXT_DOMAIN)}
          value={tone}
          options={[
            { label: __("Neutral", TEXT_DOMAIN), value: "neutral" },
            { label: __("Formal", TEXT_DOMAIN), value: "formal" },
            { label: __("Casual", TEXT_DOMAIN), value: "casual" },
          ]}
          onChange={(v?: string) => setTone((v as typeof tone) ?? "neutral")}
        />

        <SelectControl
          label={__("Length", TEXT_DOMAIN)}
          value={length}
          options={[
            { label: __("Short", TEXT_DOMAIN), value: "short" },
            { label: __("Medium", TEXT_DOMAIN), value: "medium" },
            { label: __("Long", TEXT_DOMAIN), value: "long" },
          ]}
          onChange={(v?: string) => setLength((v as typeof length) ?? "short")}
        />

        <Button
          variant="primary"
          onClick={() => {
            setError(undefined);
            setModalOpen(true);
          }}
          disabled={!canGenerate}
        >
          {__("Generate", TEXT_DOMAIN)}
        </Button>

        {error ? (
          <>
            <div style={{ marginTop: "12px" }}></div>
            <Notice
              status="error"
              isDismissible={true}
              onDismiss={() => setError(undefined)}
            >
              {error}
            </Notice>
          </>
        ) : null}

        {modalOpen && (
          <div
            ref={async (ref) => {
              if (!ref) return;
              getAiKitPlugin()
                .features.renderFeature({
                  colorMode: "light",
                  primaryColor: "blue",
                  context: "admin",
                  store: await getAiKitPlugin().features.store,
                  target: ref!,
                  mode: "write",
                  default: {
                    text: topic,
                    outputLanguage:
                      (outputLang as AiKitLanguageCode) ||
                      readDefaultOutputLanguage(),
                    instructions,
                    tone,
                    length,
                  },
                  allowOverride: {
                    text: false,
                    instructions: false,
                  },
                  variation: "modal",
                  title: __("Text generation", TEXT_DOMAIN),
                  onClose: () => {
                    setModalOpen(false);
                  },
                  onAccept: acceptInsert,
                  acceptButtonTitle: __("Apply & Insert", TEXT_DOMAIN),
                })
                .catch((error) => {
                  console.error(error.message);
                  setError(__(error.message, TEXT_DOMAIN));
                  setModalOpen(false);
                });
            }}
          ></div>
        )}
      </PanelBody>
    </>
  );
};

export const AiKitSidebar = () => (
  <Fragment>
    <PluginSidebarMoreMenuItem target="ai-kit-sidebar">
      {__("AI-Kit Sidebar", TEXT_DOMAIN)}
    </PluginSidebarMoreMenuItem>
    <PluginSidebar
      name="ai-kit-sidebar"
      title={__("AI-Kit Sidebar", TEXT_DOMAIN)}
      icon={
        <AiKitFeatureIcon
          style={{ width: "24px", height: "24px", fill: "none" }}
        />
      }
    >
      <SidebarInner />
    </PluginSidebar>
  </Fragment>
);

registerPlugin("ai-kit-sidebar", { render: AiKitSidebar });

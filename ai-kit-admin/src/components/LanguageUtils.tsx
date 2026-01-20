import { BlockControls } from "@wordpress/block-editor";
import { rawHandler } from "@wordpress/blocks";
import { ToolbarDropdownMenu, ToolbarGroup } from "@wordpress/components";
import { createHigherOrderComponent } from "@wordpress/compose";
import { select, useDispatch, useSelect } from "@wordpress/data";
import { addFilter } from "@wordpress/hooks";
import { __ } from "@wordpress/i18n";
import { Fragment, useCallback, useMemo, useState } from "react";

import {
  AiKitFeatureIcon,
  getAiKitPlugin,
  TEXT_DOMAIN,
} from "@smart-cloud/ai-kit-core";

import { mdToGutenberg } from "./utils";

type BlockInstance = {
  name: string;
  attributes: Record<string, unknown>;
};

type BlockEditorSelect = {
  getBlock: (clientId: string) => BlockInstance | undefined;
};

type BlockEditorDispatch = {
  updateBlockAttributes: (
    clientId: string,
    attrs: Record<string, unknown>,
  ) => void;
};

type Mode = "proofread" | "translate" | "rewrite";

const TARGET_BLOCKS = new Set<string>([
  "core/paragraph",
  "core/heading",
  "core/list-item",
  "core/quote",
  "core/pullquote",
  "core/verse",
  "core/preformatted",
  "core/code",
  "core/button",
]);

const CONTENT_ATTR_BY_BLOCK: Record<string, string> = {
  "core/paragraph": "content",
  "core/heading": "content",
  "core/verse": "content",
  "core/list-item": "content",
  "core/preformatted": "content",
  "core/code": "content",
  "core/quote": "value",
  "core/pullquote": "value",
  "core/button": "text",
};

const NOTICE_ID = "ai-kit-capability-unavailable";

function isTargetBlock(name: string): boolean {
  return TARGET_BLOCKS.has(name);
}

function htmlToPlain(html: string): string {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent ?? "").replace(/\r\n/g, "\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainToHtml(text: string): string {
  const escaped = escapeHtml(text).replace(/\n/g, "<br />");
  return escaped;
}

function listPlainToHtml(text: string): string {
  const items = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) return "";
  const lis = items.map((it) => `<li>${escapeHtml(it)}</li>`).join("");
  return `<ul>${lis}</ul>`;
}

function getBlockPlainText(block: BlockInstance): string {
  if (block.name === "core/list") {
    const values = String(block.attributes.values ?? "");
    return htmlToPlain(values);
  }
  const attr = CONTENT_ATTR_BY_BLOCK[block.name];
  if (!attr) return "";
  const html = String(block.attributes[attr] ?? "");
  return htmlToPlain(html);
}

function setBlockPlainText(
  block: BlockInstance,
  newText: string,
): Record<string, unknown> {
  if (block.name === "core/list") {
    return {
      ...block.attributes,
      values: listPlainToHtml(newText),
    };
  }

  const attr = CONTENT_ATTR_BY_BLOCK[block.name];
  if (!attr) return { ...block.attributes };

  return {
    ...block.attributes,
    [attr]: plainToHtml(newText),
  };
}

const withLanguageUtils = createHigherOrderComponent((BlockEdit: unknown) => {
  const BlockEditComponent = BlockEdit as (props: {
    name: string;
    clientId: string;
  }) => JSX.Element;

  return function EnhancedBlockEdit(props: { name: string; clientId: string }) {
    const { name, clientId } = props;

    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState<Mode>("proofread");

    const [block, setBlock] = useState<BlockInstance | null>(null);
    const [original, setOriginal] = useState<string>("");

    const { createNotice, removeNotice } = useDispatch("core/notices");

    const { getBlockIndex } = useSelect("core/block-editor") as {
      getBlockIndex: (clientId: string) => number;
    };
    const { insertBlocks, removeBlock } = useDispatch("core/block-editor") as {
      insertBlocks: (blocks: unknown[], index: number) => void;
      removeBlock: (clientId: string) => void;
    };

    const { updateBlockAttributes } = useDispatch(
      "core/block-editor",
    ) as unknown as BlockEditorDispatch;

    const open = useCallback(
      (next: Mode) => {
        if (!isTargetBlock(name)) return;
        const store = select(
          "core/block-editor",
        ) as unknown as BlockEditorSelect;
        const b = store.getBlock(clientId);
        if (!b) return;

        setBlock(b);
        setOriginal(getBlockPlainText(b));
        setMode(next);
        setModalOpen(true);
      },
      [clientId, name],
    );

    const replaceBlock = useCallback(
      (generated: unknown, clientId: string) => {
        try {
          const HTML = mdToGutenberg(generated as string);
          const blocks = rawHandler({ HTML });
          insertBlocks(blocks, getBlockIndex(clientId));
          removeBlock(clientId);
          setModalOpen(false);
        } catch (e) {
          console.error("Error inserting blocks:", e);
        }
      },
      [getBlockIndex, insertBlocks, removeBlock],
    );

    const accept = useCallback(
      (generated: unknown) => {
        if (!block || !generated) return;

        switch (mode) {
          case "proofread": {
            const result = generated as ProofreadResult;
            if (!result.correctedInput) return;
            updateBlockAttributes(
              clientId,
              setBlockPlainText(block, result.correctedInput),
            );
            break;
          }
          case "translate": {
            updateBlockAttributes(
              clientId,
              setBlockPlainText(block, generated as string),
            );
            break;
          }
          case "rewrite": {
            replaceBlock(generated as string, clientId);
            break;
          }
        }
        setModalOpen(false);
      },
      [replaceBlock, block, clientId, mode, updateBlockAttributes],
    );

    const showError = useCallback(
      (message: string) => {
        createNotice("error", message, {
          id: NOTICE_ID,
          type: "snackbar",
          isDismissible: true,
          onDismiss: () => {
            removeNotice(NOTICE_ID);
          },
        });
      },
      [createNotice, removeNotice],
    );

    const title = useMemo(() => {
      if (mode === "proofread") return __("Proofread", TEXT_DOMAIN);
      if (mode === "translate") return __("Translate", TEXT_DOMAIN);
      return __("Rewrite", TEXT_DOMAIN);
    }, [mode]);

    return (
      <Fragment>
        <BlockEditComponent {...props} />

        {isTargetBlock(name) ? (
          <BlockControls>
            <ToolbarGroup>
              <ToolbarDropdownMenu
                icon={
                  <AiKitFeatureIcon
                    style={{ width: "24px", height: "24px", fill: "none" }}
                  />
                }
                label={__("AI-Kit Tools", TEXT_DOMAIN)}
                controls={[
                  {
                    title: __("Proofread", TEXT_DOMAIN),
                    onClick: () => open("proofread"),
                  },
                  {
                    title: __("Translate", TEXT_DOMAIN),
                    onClick: () => open("translate"),
                  },
                  {
                    title: __("Rewrite", TEXT_DOMAIN),
                    onClick: () => open("rewrite"),
                  },
                ]}
              />
            </ToolbarGroup>
          </BlockControls>
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
                  mode: mode,
                  default: {
                    text: original,
                    inputLanguage: "auto",
                    outputLanguage: mode === "rewrite" ? "auto" : undefined,
                    tone: "as-is",
                    length: "as-is",
                  },
                  variation: "modal",
                  autoRun: mode === "proofread",
                  title: title,
                  onClose: () => {
                    setModalOpen(false);
                  },
                  onAccept: accept,
                  acceptButtonTitle: __("Accept", TEXT_DOMAIN),
                })
                .catch((error) => {
                  console.error(error.message);
                  showError(__(error.message, TEXT_DOMAIN));
                  setModalOpen(false);
                });
            }}
          ></div>
        )}
      </Fragment>
    );
  };
}, "withLanguageUtils");

addFilter("editor.BlockEdit", "ai-kit/language-utils", withLanguageUtils);

export default null;

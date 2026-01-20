import { DEFAULT_THEME } from "@mantine/core";
import {
  AiFeatureArgs,
  AiKitLanguageCode,
  CustomTranslations,
  getStore,
  getStoreSelect,
  LANGUAGE_OPTIONS,
  RewriteArgs,
  Store,
  SummarizeArgs,
  TEXT_DOMAIN,
  WriteArgs,
} from "@smart-cloud/ai-kit-core";
import {
  InspectorControls,
  useBlockProps,
  useInnerBlocksProps,
} from "@wordpress/block-editor";
import { type BlockEditProps } from "@wordpress/blocks";
import {
  Button,
  CheckboxControl,
  ColorPicker,
  ComboboxControl,
  PanelBody,
  Popover,
  RadioControl,
  TextareaControl,
  TextControl,
} from "@wordpress/components";
import { useLayoutEffect, useRef } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import {
  createRef,
  useEffect,
  useMemo,
  useState,
  type FunctionComponent,
} from "react";

import { AiFeatureMode } from "@smart-cloud/ai-kit-core";
import { translations } from "@smart-cloud/ai-kit-ui";
import { useSelect } from "@wordpress/data";
import { I18n } from "aws-amplify/utils";
import { COLOR_MODE_OPTIONS, DIRECTION_OPTIONS } from "../index";
import { App } from "./app";

I18n.putVocabularies(translations);

export interface Attributes {
  anchor: string;
}

export interface EditorBlock {
  attributes: Attributes;
  innerBlocks: EditorBlock[];
}

export interface EditorBlockProps {
  inputSelector?: string;
  outputSelector?: string;
  mode?: AiFeatureMode;
  editable?: boolean;
  autoRun?: boolean;
  variation?: AiFeatureArgs["variation"];
  language?: AiFeatureArgs["language"];
  direction?: AiFeatureArgs["direction"];
  title?: string;
  openButtonTitle?: string;
  showOpenButtonTitle?: boolean;
  openButtonIcon?: string;
  showOpenButtonIcon?: boolean;
  showRegenerateOnBackendButton?: boolean;
  acceptButtonTitle?: string;
  optionsDisplay?: "collapse" | "vertical" | "horizontal";
  default?: {
    text?: string;
    instructions?: string;
    tone?: WriteArgs["tone"] | RewriteArgs["tone"];
    length?:
      | WriteArgs["length"]
      | RewriteArgs["length"]
      | SummarizeArgs["length"];
    type?: SummarizeArgs["type"];
    outputLanguage?: AiKitLanguageCode;
    outputFormat?: "plain-text" | "markdown" | "html";
  };
  allowOverride?: {
    text?: boolean;
    instructions?: boolean;
    tone?: boolean;
    length?: boolean;
    type?: boolean;
    outputLanguage?: boolean;
  };
  colorMode?: AiFeatureArgs["colorMode"];
  primaryColor?: AiFeatureArgs["primaryColor"];
  primaryShade?: AiFeatureArgs["primaryShade"];
  colors?: AiFeatureArgs["colors"];
  uid?: string;
  customCSS?: string;
  styleText?: string;
}

const useScopedCssCompat = (id: string, css: string) => {
  const latestCssRef = useRef(css);

  useLayoutEffect(() => {
    latestCssRef.current = css;
  }, [css]);

  useLayoutEffect(() => {
    const iframe = document.querySelector(
      'iframe[name="editor-canvas"], iframe.block-editor-iframe',
    ) as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    if (!doc?.head) return;

    let tag = doc.getElementById(id) as HTMLStyleElement | null;
    if (!tag) {
      tag = doc.createElement("style");
      tag.id = id;
      doc.head.appendChild(tag);
    }
    if (tag.textContent !== latestCssRef.current) {
      tag.textContent = latestCssRef.current;
    }
    return () => tag?.remove();
  }, [id, css]);
};
const Divider = () => (
  <div style={{ borderTop: "1px solid #ddd", margin: "12px 0" }} />
);

export const Edit: FunctionComponent<BlockEditProps<EditorBlockProps>> = (
  props: BlockEditProps<EditorBlockProps>,
) => {
  const { clientId, attributes, setAttributes } = props;
  const {
    mode,
    editable,
    autoRun,
    default: defaults,
    allowOverride,
    inputSelector,
    outputSelector,
    variation,
    language,
    direction,
    title,
    openButtonTitle,
    showOpenButtonTitle,
    openButtonIcon,
    showOpenButtonIcon,
    showRegenerateOnBackendButton,
    acceptButtonTitle,
    colorMode,
    primaryColor,
    colors,
    primaryShade,
    optionsDisplay,
    customCSS,
    styleText,
    uid,
  } = attributes;

  const [fulfilledStore, setFulfilledStore] = useState<Store>();
  const [previewMode, setPreviewMode] = useState<AiFeatureArgs["mode"]>();
  const [themeDirection, setThemeDirection] =
    useState<AiFeatureArgs["direction"]>();
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(
    null,
  );
  const colorButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const customTranslations: CustomTranslations | undefined | null = useSelect(
    () =>
      fulfilledStore
        ? getStoreSelect(fulfilledStore).getCustomTranslations()
        : {},
    [fulfilledStore],
  );

  const editorRef = createRef<HTMLDivElement>();

  const scopedCSS = attributes.customCSS?.replace(
    /selector/g,
    `.wp-block-css-box-${uid}`,
  );

  useScopedCssCompat(`css-${uid}`, scopedCSS || "");

  const blockProps = useBlockProps({
    className: `wp-block-css-box-${uid}`,
  });
  const { ...innerBlocksProps } = useInnerBlocksProps(blockProps);

  const defaultTitle = useMemo(() => {
    if (language) {
      I18n.setLanguage(language || "en");
    }
    let title;
    switch (mode) {
      default:
      case "summarize":
        title = I18n.get("Summarize");
        break;
      case "proofread":
        title = I18n.get("Proofread");
        break;
      case "write":
        title = I18n.get("Write");
        break;
      case "rewrite":
        title = I18n.get("Rewrite");
        break;
      case "translate":
        title = I18n.get("Translate");
        break;
    }
    return title;
  }, [mode, language]);

  useEffect(() => {
    let td = direction;
    if (!direction || direction === "auto") {
      td = language === "ar" || language === "he" ? "rtl" : "ltr";
    }
    queueMicrotask(() => {
      setThemeDirection(td as AiFeatureArgs["direction"]);
    });
  }, [direction, language]);

  useEffect(() => {
    if (!uid) {
      setAttributes({ uid: clientId.slice(0, 8) });
    }
  }, [clientId, setAttributes, uid]);

  useEffect(() => {
    I18n.putVocabularies(customTranslations || {});
  }, [customTranslations]);

  useEffect(() => {
    getStore().then((fulfilledStore) => {
      setFulfilledStore(fulfilledStore);
    });
  }, []);

  return (
    <div {...innerBlocksProps}>
      <div ref={editorRef}>
        <InspectorControls>
          <PanelBody title={__("Settings", TEXT_DOMAIN)}>
            <ComboboxControl
              label={__("Mode", TEXT_DOMAIN)}
              value={mode || ""}
              options={[
                {
                  label: __("Summarize", TEXT_DOMAIN),
                  value: "summarize",
                },
                {
                  label: __("Proofread", TEXT_DOMAIN),
                  value: "proofread",
                },
                { label: __("Write", TEXT_DOMAIN), value: "write" },
                {
                  label: __("Rewrite", TEXT_DOMAIN),
                  value: "rewrite",
                },
                {
                  label: __("Translate", TEXT_DOMAIN),
                  value: "translate",
                },
              ]}
              onChange={(value) => {
                setAttributes({ mode: value as AiFeatureArgs["mode"] });
                setPreviewMode(value as AiFeatureArgs["mode"]);
              }}
              help={__("Select the AI-Kit feature.", TEXT_DOMAIN)}
            />
            <CheckboxControl
              label={__("Editable", TEXT_DOMAIN)}
              checked={editable === undefined || editable}
              onChange={(value) => {
                setAttributes({
                  editable: value !== undefined ? value : editable,
                });
              }}
              help={__("Toggle to enable or disable editing.", TEXT_DOMAIN)}
            />
            <CheckboxControl
              label={__("Auto Run", TEXT_DOMAIN)}
              checked={autoRun === undefined || autoRun}
              onChange={(value) => {
                setAttributes({
                  autoRun: value !== undefined ? value : autoRun,
                });
              }}
              help={__("Toggle to enable or disable auto run.", TEXT_DOMAIN)}
            />
            {mode !== "write" && (
              <>
                <Divider />
                <TextControl
                  label={__("Input selector", TEXT_DOMAIN)}
                  value={inputSelector || ""}
                  onChange={(value) => {
                    setAttributes({ inputSelector: value });
                  }}
                  help={__(
                    "CSS selector for the input content (if applicable).",
                    TEXT_DOMAIN,
                  )}
                />
              </>
            )}
            <TextControl
              label={__("Output selector", TEXT_DOMAIN)}
              value={outputSelector || ""}
              onChange={(value) => {
                setAttributes({ outputSelector: value });
              }}
              help={__(
                "CSS selector for the output content (if applicable).",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <RadioControl
              label={__("Variation", TEXT_DOMAIN)}
              selected={variation || "default"}
              options={[
                { label: __("Default", TEXT_DOMAIN), value: "default" },
                { label: __("Modal", TEXT_DOMAIN), value: "modal" },
              ]}
              onChange={(value) => {
                setAttributes({
                  variation: (value as AiFeatureArgs["variation"]) || "default",
                });
              }}
              help={__(
                "Choose whether the AI-Kit Feature block appears inline (Default) or in a modal dialog (Modal).",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <ComboboxControl
              label={__("Language", TEXT_DOMAIN)}
              value={language || ""}
              options={[
                { value: "", label: __("--- Select ---", TEXT_DOMAIN) },
                ...LANGUAGE_OPTIONS,
              ]}
              onChange={(value) => {
                setAttributes({ language: value as AiFeatureArgs["language"] });
              }}
              help={__(
                "Set the AI-Kit Feature block’s display language.",
                TEXT_DOMAIN,
              )}
            />
            <RadioControl
              label={__("Direction", TEXT_DOMAIN)}
              selected={direction || "auto"}
              options={DIRECTION_OPTIONS}
              onChange={(value) => {
                setAttributes({
                  direction: value as AiFeatureArgs["direction"],
                });
              }}
              help={__(
                "Choose the AI-Kit Feature block’s layout direction—Auto (default; follows the selected language), Left‑to‑Right, or Right‑to‑Left.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <TextControl
              label={__("Title", TEXT_DOMAIN)}
              value={title || ""}
              placeholder={defaultTitle || ""}
              onChange={(value) => {
                setAttributes({ title: value });
              }}
              help={__(
                "Override the default title displayed on the AI-Kit Feature block. Leave empty to use the standard title for the selected mode.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <TextControl
              label={__("Open Button Title", TEXT_DOMAIN)}
              value={openButtonTitle || ""}
              placeholder={
                defaultTitle || __("Open AI-Kit Feature", TEXT_DOMAIN)
              }
              onChange={(value) => {
                setAttributes({ openButtonTitle: value });
              }}
              help={__(
                "Override the button label. Leave empty to use the current screen’s default title.",
                TEXT_DOMAIN,
              )}
            />
            <CheckboxControl
              label={__("Show", TEXT_DOMAIN)}
              checked={showOpenButtonTitle === undefined || showOpenButtonTitle}
              onChange={(value) => {
                setAttributes({
                  showOpenButtonTitle:
                    value !== undefined ? value : showOpenButtonTitle,
                });
              }}
              help={__(
                "Toggle to show or hide the open button title.",
                TEXT_DOMAIN,
              )}
            />
            <TextControl
              label={__("Custom Open Button Icon", TEXT_DOMAIN)}
              value={openButtonIcon || ""}
              placeholder="<svg>...</svg>"
              onChange={(value) => {
                setAttributes({ openButtonIcon: value });
              }}
              help={__(
                "Override the default open button icon. Leave empty to use the current mode’s default icon.",
                TEXT_DOMAIN,
              )}
            />
            <CheckboxControl
              label={__("Show", TEXT_DOMAIN)}
              checked={showOpenButtonIcon === undefined || showOpenButtonIcon}
              onChange={(value) => {
                setAttributes({
                  showOpenButtonIcon:
                    value !== undefined ? value : showOpenButtonIcon,
                });
              }}
              help={__(
                "Toggle to show or hide the open button icon.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <RadioControl
              label={__("Options Display", TEXT_DOMAIN)}
              selected={optionsDisplay || "collapse"}
              options={[
                {
                  label: __("Collapse (default)", TEXT_DOMAIN),
                  value: "collapse",
                },
                { label: __("Vertical", TEXT_DOMAIN), value: "vertical" },
                { label: __("Horizontal", TEXT_DOMAIN), value: "horizontal" },
              ]}
              onChange={(value) => {
                setAttributes({
                  optionsDisplay: value as EditorBlockProps["optionsDisplay"],
                });
              }}
              help={__(
                "Choose how options are displayed: collapsed, vertical, or horizontal.",
                TEXT_DOMAIN,
              )}
            />
            <CheckboxControl
              label={__("Show Regenerate On Backend Button", TEXT_DOMAIN)}
              checked={
                showRegenerateOnBackendButton === undefined ||
                showRegenerateOnBackendButton
              }
              onChange={(value) => {
                setAttributes({
                  showRegenerateOnBackendButton:
                    value !== undefined ? value : showRegenerateOnBackendButton,
                });
              }}
              help={__(
                "Toggle to show or hide the 'Regenerate on Backend' button (if applicable).",
                TEXT_DOMAIN,
              )}
            />
            <TextControl
              label={__("Accept Button Title", TEXT_DOMAIN)}
              value={acceptButtonTitle || ""}
              placeholder={__("Accept", TEXT_DOMAIN)}
              onChange={(value) => {
                setAttributes({ acceptButtonTitle: value });
              }}
              help={__(
                "Override the accept button label. Leave empty to use the default 'Accept' title.",
                TEXT_DOMAIN,
              )}
            />
          </PanelBody>
          <PanelBody title={__("Defaults", TEXT_DOMAIN)} initialOpen={false}>
            {mode === "write" && (
              <>
                <TextControl
                  label={__("Topic", TEXT_DOMAIN)}
                  value={defaults?.text || ""}
                  onChange={(value) => {
                    setAttributes({ default: { ...defaults, text: value } });
                  }}
                  help={__(
                    "Specify the topic or subject for the writing task.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Overridable", TEXT_DOMAIN)}
                  checked={
                    allowOverride?.text === undefined || allowOverride?.text
                  }
                  onChange={(value) => {
                    setAttributes({
                      allowOverride: {
                        ...allowOverride,
                        text: value !== undefined ? value : allowOverride?.text,
                      },
                    });
                  }}
                  help={__(
                    "Allow users to override the default topic when using the block.",
                    TEXT_DOMAIN,
                  )}
                />
                <Divider />
              </>
            )}
            {(mode === "write" || mode === "rewrite") && (
              <>
                <TextControl
                  label={__("Instructions", TEXT_DOMAIN)}
                  value={defaults?.instructions || ""}
                  onChange={(value) => {
                    setAttributes({
                      default: { ...defaults, instructions: value },
                    });
                  }}
                  help={__(
                    "Provide any specific instructions for the AI task.",
                    TEXT_DOMAIN,
                  )}
                />
                <Divider />
                <CheckboxControl
                  label={__("Overridable", TEXT_DOMAIN)}
                  checked={
                    allowOverride?.instructions === undefined ||
                    allowOverride?.instructions
                  }
                  onChange={(value) => {
                    setAttributes({
                      allowOverride: {
                        ...allowOverride,
                        instructions:
                          value !== undefined
                            ? value
                            : allowOverride?.instructions,
                      },
                    });
                  }}
                  help={__(
                    "Allow users to override the default instructions when using the block.",
                    TEXT_DOMAIN,
                  )}
                />
                <RadioControl
                  label={__("Tone", TEXT_DOMAIN)}
                  selected={
                    defaults?.tone || (mode === "write" ? "neutral" : "as-is")
                  }
                  options={
                    mode === "write"
                      ? [
                          {
                            label: __("Neutral (default)", TEXT_DOMAIN),
                            value: "neutral",
                          },
                          {
                            label: __("Formal", TEXT_DOMAIN),
                            value: "formal",
                          },
                          { label: __("Casual", TEXT_DOMAIN), value: "casual" },
                        ]
                      : [
                          {
                            label: __("As-is (default)", TEXT_DOMAIN),
                            value: "as-is",
                          },
                          {
                            label: __("More Formal", TEXT_DOMAIN),
                            value: "more-formal",
                          },
                          {
                            label: __("More Casual", TEXT_DOMAIN),
                            value: "more-casual",
                          },
                        ]
                  }
                  onChange={(value) => {
                    setAttributes({
                      default: { ...defaults, tone: value },
                    });
                  }}
                  help={__(
                    "Select the desired tone for the AI output.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Overridable", TEXT_DOMAIN)}
                  checked={
                    allowOverride?.tone === undefined || allowOverride?.tone
                  }
                  onChange={(value) => {
                    setAttributes({
                      allowOverride: {
                        ...allowOverride,
                        tone: value !== undefined ? value : allowOverride?.tone,
                      },
                    });
                  }}
                  help={__(
                    "Allow users to override the default topic when using the block.",
                    TEXT_DOMAIN,
                  )}
                />
                <Divider />
              </>
            )}
            {(mode === "write" ||
              mode === "rewrite" ||
              mode === "summarize") && (
              <>
                <RadioControl
                  label={__("Length", TEXT_DOMAIN)}
                  selected={
                    defaults?.length ||
                    (mode === "write" || mode === "summarize"
                      ? "short"
                      : "as-is")
                  }
                  options={
                    mode === "write" || mode === "summarize"
                      ? [
                          {
                            label: __("Short (default)", TEXT_DOMAIN),
                            value: "short",
                          },
                          {
                            label: __("Medium", TEXT_DOMAIN),
                            value: "medium",
                          },
                          { label: __("Long", TEXT_DOMAIN), value: "long" },
                        ]
                      : [
                          {
                            label: __("As-is (default)", TEXT_DOMAIN),
                            value: "as-is",
                          },
                          {
                            label: __("Shorter", TEXT_DOMAIN),
                            value: "shorter",
                          },
                          {
                            label: __("Longer", TEXT_DOMAIN),
                            value: "longer",
                          },
                        ]
                  }
                  onChange={(value) => {
                    setAttributes({
                      default: { ...defaults, length: value },
                    });
                  }}
                  help={__(
                    "Select the desired length for the AI output.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Overridable", TEXT_DOMAIN)}
                  checked={
                    allowOverride?.length === undefined || allowOverride?.length
                  }
                  onChange={(value) => {
                    setAttributes({
                      allowOverride: {
                        ...allowOverride,
                        length:
                          value !== undefined ? value : allowOverride?.length,
                      },
                    });
                  }}
                  help={__(
                    "Allow users to override the default length when using the block.",
                    TEXT_DOMAIN,
                  )}
                />
                <Divider />
              </>
            )}
            {mode === "summarize" && (
              <>
                <RadioControl
                  label={__("Type", TEXT_DOMAIN)}
                  selected={defaults?.type || "key-points"}
                  options={[
                    {
                      label: __("Headline", TEXT_DOMAIN),
                      value: "headline",
                    },
                    {
                      label: __("Key Points (default)", TEXT_DOMAIN),
                      value: "key-points",
                    },
                    {
                      label: __("Teaser", TEXT_DOMAIN),
                      value: "teaser",
                    },
                    { label: __("TL;DR", TEXT_DOMAIN), value: "tldr" },
                  ]}
                  onChange={(value) => {
                    setAttributes({
                      default: { ...defaults, type: value },
                    });
                  }}
                  help={__(
                    "Select the format for the AI output: plain text, markdown, or HTML.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Overridable", TEXT_DOMAIN)}
                  checked={
                    allowOverride?.type === undefined || allowOverride?.type
                  }
                  onChange={(value) => {
                    setAttributes({
                      allowOverride: {
                        ...allowOverride,
                        type: value !== undefined ? value : allowOverride?.type,
                      },
                    });
                  }}
                  help={__(
                    "Allow users to override the default type when using the block.",
                    TEXT_DOMAIN,
                  )}
                />
                <Divider />
              </>
            )}
            {mode !== "proofread" && (
              <>
                <ComboboxControl
                  label={__("Language", TEXT_DOMAIN)}
                  value={defaults?.outputLanguage || ""}
                  options={[
                    { value: "", label: __("--- Select ---", TEXT_DOMAIN) },
                    ...LANGUAGE_OPTIONS,
                  ]}
                  onChange={(value) => {
                    setAttributes({
                      default: {
                        ...defaults,
                        outputLanguage: value as AiKitLanguageCode,
                      },
                    });
                  }}
                  help={__(
                    "Set the AI-Kit Feature block’s display language.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Overridable", TEXT_DOMAIN)}
                  checked={
                    allowOverride?.outputLanguage === undefined ||
                    allowOverride?.outputLanguage
                  }
                  onChange={(value) => {
                    setAttributes({
                      allowOverride: {
                        ...allowOverride,
                        outputLanguage:
                          value !== undefined
                            ? value
                            : allowOverride?.outputLanguage,
                      },
                    });
                  }}
                  help={__(
                    "Allow users to override the default output language when using the block.",
                    TEXT_DOMAIN,
                  )}
                />
                <Divider />
              </>
            )}
            <RadioControl
              label={__("Output Format", TEXT_DOMAIN)}
              selected={defaults?.outputFormat || "markdown"}
              options={[
                { label: __("Plain Text", TEXT_DOMAIN), value: "plain-text" },
                {
                  label: __("Markdown (default)", TEXT_DOMAIN),
                  value: "markdown",
                },
                { label: __("HTML", TEXT_DOMAIN), value: "html" },
              ]}
              onChange={(value) => {
                setAttributes({
                  default: {
                    ...defaults,
                    outputFormat: value as "plain-text" | "markdown" | "html",
                  },
                });
              }}
              help={__(
                "Select the format for the AI output: plain text, markdown, or HTML.",
                TEXT_DOMAIN,
              )}
            />
          </PanelBody>
          <PanelBody title={__("Theming", TEXT_DOMAIN)} initialOpen={false}>
            <RadioControl
              label={__("Color Mode", TEXT_DOMAIN)}
              selected={colorMode || "light"}
              options={COLOR_MODE_OPTIONS}
              onChange={(value) => {
                setAttributes({
                  colorMode: value as AiFeatureArgs["colorMode"],
                });
              }}
              help={__(
                "Select the AI-Kit Feature block’s color scheme—Light, Dark, or Auto (follows the user’s system preference).",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <ComboboxControl
              label={__("Primary Color", TEXT_DOMAIN)}
              value={primaryColor || ""}
              options={[
                ...Object.keys(DEFAULT_THEME.colors).map((color) => ({
                  label: color,
                  value: color,
                })),
                ...(colors
                  ? Object.keys(colors).map((color) => ({
                      label: color,
                      value: color,
                    }))
                  : []),
              ]}
              onChange={(value) => {
                setAttributes({ primaryColor: value ?? "" });
              }}
              help={__(
                "Set the primary color for the AI-Kit Feature block (default Mantine colors and your custom colors).",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{ fontWeight: 600, display: "block", marginBottom: 4 }}
              >
                {__("Custom Colors", TEXT_DOMAIN)}
              </label>
              {!colors || Object.keys(colors).length === 0 ? (
                <div style={{ color: "#888", marginBottom: 8 }}>
                  {__("No custom color definitions yet.", TEXT_DOMAIN)}
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {Object.entries(colors).map(([key, val]) => (
                    <li
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: 6,
                        gap: 8,
                      }}
                    >
                      <TextControl
                        label={__("Name", TEXT_DOMAIN)}
                        value={key}
                        style={{ minWidth: 80, flex: 1 }}
                        onChange={(newKey) => {
                          if (!newKey || newKey === key) return;
                          const newColors = { ...colors };
                          delete newColors[key];
                          newColors[newKey] = val;
                          setAttributes({ colors: newColors });
                        }}
                      />
                      <TextControl
                        label={__("Value", TEXT_DOMAIN)}
                        value={val}
                        style={{ maxWidth: 70 }}
                        onChange={(newValue) => {
                          const newColors = { ...colors, [key]: newValue };
                          setAttributes({ colors: newColors });
                        }}
                      />
                      <Button
                        ref={(el) => {
                          colorButtonRefs.current[key] = el;
                        }}
                        type="button"
                        onClick={() =>
                          setActiveColorPicker(
                            activeColorPicker === key ? null : key,
                          )
                        }
                        aria-label={__("Pick color", TEXT_DOMAIN)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 4,
                          padding: 0,
                          border: "1px solid #ccc",
                          backgroundColor: val || "#000000",
                        }}
                      />
                      {activeColorPicker === key &&
                        colorButtonRefs.current[key] && (
                          <Popover
                            anchor={colorButtonRefs.current[key]}
                            onClose={() => setActiveColorPicker(null)}
                            focusOnMount={false}
                          >
                            <ColorPicker
                              color={val}
                              onChangeComplete={(color) => {
                                const nextColor = (color as { hex: string })
                                  .hex;
                                const newColors = {
                                  ...colors,
                                  [key]: nextColor,
                                };
                                setAttributes({ colors: newColors });
                              }}
                              disableAlpha
                            />
                          </Popover>
                        )}
                      <Button
                        icon="no-alt"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.preventDefault();
                          const newColors = { ...colors };
                          delete newColors[key];
                          setAttributes({ colors: newColors });
                        }}
                        style={{
                          color: "#d63638",
                          cursor: "pointer",
                          fontSize: 16,
                          background: "none",
                          border: "none",
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="secondary"
                style={{
                  marginTop: 8,
                  padding: "4px 12px",
                  fontSize: 14,
                }}
                onClick={() => {
                  // Find a unique name
                  let idx = 1;
                  const name = "custom";
                  while (colors && colors[name + idx]) idx++;
                  const newName = name + idx;
                  setAttributes({
                    colors: { ...(colors || {}), [newName]: "#000000" },
                  });
                }}
              >
                {__("Add Color", TEXT_DOMAIN)}
              </Button>
              <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                {__(
                  "Define custom colors as name and base color (e.g. my-color: #ff0000). Mantine will generate 10 shades for each.",
                  TEXT_DOMAIN,
                )}
              </div>
            </div>
            <Divider />
            <ComboboxControl
              label={__("Primary Shade (Light)", TEXT_DOMAIN)}
              value={primaryShade?.light?.toString() || ""}
              options={Array.from({ length: 10 }, (_, i) => ({
                label: i.toString(),
                value: i.toString(),
              }))}
              onChange={(value) => {
                setAttributes({
                  primaryShade: {
                    ...primaryShade,
                    light:
                      value === "" || value === null || value === undefined
                        ? undefined
                        : (parseInt(value!) as
                            | 0
                            | 1
                            | 2
                            | 3
                            | 4
                            | 5
                            | 6
                            | 7
                            | 8
                            | 9),
                  },
                });
              }}
              help={__(
                "Set the primary shade for light mode (0–9). Leave empty for default.",
                TEXT_DOMAIN,
              )}
            />
            <ComboboxControl
              label={__("Primary Shade (Dark)", TEXT_DOMAIN)}
              value={primaryShade?.dark?.toString() || ""}
              options={Array.from({ length: 10 }, (_, i) => ({
                label: i.toString(),
                value: i.toString(),
              }))}
              onChange={(value) => {
                setAttributes({
                  primaryShade: {
                    ...primaryShade,
                    dark:
                      value === "" || value === null || value === undefined
                        ? undefined
                        : (parseInt(value!) as
                            | 0
                            | 1
                            | 2
                            | 3
                            | 4
                            | 5
                            | 6
                            | 7
                            | 8
                            | 9),
                  },
                });
              }}
              help={__(
                "Set the primary shade for dark mode (0–9). Leave empty for default.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <TextareaControl
              __nextHasNoMarginBottom
              value={customCSS || ""}
              onChange={(v) => setAttributes({ customCSS: v })}
              help={__(
                "Add custom CSS styles for the AI-Kit Feature block. Use 'selector' to target the block container's host.",
                TEXT_DOMAIN,
              )}
            />
            <TextareaControl
              __nextHasNoMarginBottom
              value={styleText || ""}
              onChange={(v) => setAttributes({ styleText: v })}
              help={__(
                "Add raw CSS styles injected into the AI-Kit Feature block’s shadow DOM.",
                TEXT_DOMAIN,
              )}
            />
          </PanelBody>
        </InspectorControls>
        {fulfilledStore && mode ? (
          <App
            isPreview={true}
            className={`wp-block-css-box-${uid}`}
            store={fulfilledStore}
            mode={previewMode || mode}
            editable={editable}
            autoRun={autoRun}
            variation={variation || "default"}
            optionsDisplay={optionsDisplay || "collapse"}
            default={defaults}
            inputSelector={inputSelector}
            outputSelector={outputSelector}
            language={language || "en"}
            direction={themeDirection || "auto"}
            title={title || defaultTitle}
            openButtonTitle={openButtonTitle}
            showOpenButtonTitle={showOpenButtonTitle}
            openButtonIcon={openButtonIcon}
            showOpenButtonIcon={showOpenButtonIcon}
            showRegenerateOnBackendButton={showRegenerateOnBackendButton}
            acceptButtonTitle={acceptButtonTitle}
            colorMode={colorMode || "auto"}
            primaryColor={primaryColor}
            primaryShade={primaryShade}
            colors={colors}
            allowOverride={allowOverride}
            styleText={styleText}
          />
        ) : (
          <>
            {__(
              "Please configure the AI-Kit Feature block settings.",
              TEXT_DOMAIN,
            )}
          </>
        )}
      </div>
    </div>
  );
};

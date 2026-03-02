import { DEFAULT_THEME } from "@mantine/core";
import {
  CustomTranslations,
  DocSearchArgs,
  getStore,
  getStoreSelect,
  LANGUAGE_OPTIONS,
  Store,
  TEXT_DOMAIN,
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
import { useRef } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { createRef, useEffect, useState, type FunctionComponent } from "react";

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
  variation?: DocSearchArgs["variation"];
  autoRun?: boolean;
  language?: DocSearchArgs["language"];
  direction?: DocSearchArgs["direction"];
  title?: string;
  placeholder?: string;
  instructionLabel?: string;
  summaryLabel?: string;
  sourcesLabel?: string;
  showOpenButton?: boolean;
  openButtonTitle?: string;
  showOpenButtonTitle?: boolean;
  openButtonIcon?: string;
  showOpenButtonIcon?: boolean;
  showSearchButtonTitle?: boolean;
  searchButtonIcon?: string;
  showSearchButtonIcon?: boolean;
  colorMode?: DocSearchArgs["colorMode"];
  primaryColor?: DocSearchArgs["primaryColor"];
  primaryShade?: DocSearchArgs["primaryShade"];
  colors?: DocSearchArgs["colors"];
  uid?: string;
  themeOverrides?: string;
  topK?: number;
  snippetMaxChars?: number;
}

const Divider = () => (
  <div style={{ borderTop: "1px solid #ddd", margin: "12px 0" }} />
);

export const Edit: FunctionComponent<BlockEditProps<EditorBlockProps>> = (
  props: BlockEditProps<EditorBlockProps>,
) => {
  const { clientId, attributes, setAttributes } = props;
  const {
    inputSelector,
    variation,
    autoRun,
    language,
    direction,
    title,
    showOpenButton,
    openButtonTitle,
    showOpenButtonTitle,
    openButtonIcon,
    showOpenButtonIcon,
    showSearchButtonTitle,
    searchButtonIcon,
    showSearchButtonIcon,
    colorMode,
    primaryColor,
    colors,
    primaryShade,
    themeOverrides,
    uid,
    topK,
    snippetMaxChars,
  } = attributes;

  const [fulfilledStore, setFulfilledStore] = useState<Store>();
  const [themeDirection, setThemeDirection] =
    useState<DocSearchArgs["direction"]>();
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

  const blockProps = useBlockProps();
  const { ...innerBlocksProps } = useInnerBlocksProps(blockProps);

  useEffect(() => {
    if (language) {
      I18n.setLanguage(language || "en");
    }
    let td = direction;
    if (!direction || direction === "auto") {
      td = language === "ar" || language === "he" ? "rtl" : "ltr";
    }
    queueMicrotask(() => {
      setThemeDirection(td as DocSearchArgs["direction"]);
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
                  variation: (value as DocSearchArgs["variation"]) || "default",
                });
              }}
              help={__(
                "Choose whether the AI-Kit Doc Search block appears inline (Default) or in a modal dialog (Modal).",
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
                setAttributes({
                  language: value as DocSearchArgs["language"],
                });
              }}
              help={__(
                "Set the AI-Kit Doc Search block’s display language.",
                TEXT_DOMAIN,
              )}
            />
            <RadioControl
              label={__("Direction", TEXT_DOMAIN)}
              selected={direction || "auto"}
              options={DIRECTION_OPTIONS}
              onChange={(value) => {
                setAttributes({
                  direction: value as DocSearchArgs["direction"],
                });
              }}
              help={__(
                "Choose the AI-Kit Doc Search block’s layout direction—Auto (default; follows the selected language), Left‑to‑Right, or Right‑to‑Left.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <TextControl
              label={__("Title", TEXT_DOMAIN)}
              value={title || ""}
              placeholder={__("Search with AI-Kit", TEXT_DOMAIN)}
              onChange={(value) => {
                setAttributes({ title: value });
              }}
              help={__(
                "Override the default title displayed on the AI-Kit Doc Search block. Leave empty to use the standard title.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <CheckboxControl
              label={__("Show Open Button", TEXT_DOMAIN)}
              checked={showOpenButton || false}
              onChange={(value) => {
                setAttributes({
                  showOpenButton: value !== undefined ? value : false,
                });
              }}
              help={__(
                "Toggle to show or hide the open button. When enabled, the search interface opens only after clicking the button.",
                TEXT_DOMAIN,
              )}
            />
            {showOpenButton && (
              <>
                <TextControl
                  label={__("Open Button Title", TEXT_DOMAIN)}
                  value={openButtonTitle || ""}
                  placeholder={title || __("Search with AI-Kit", TEXT_DOMAIN)}
                  onChange={(value) => {
                    setAttributes({ openButtonTitle: value });
                  }}
                  help={__(
                    "Override the default open button title. Leave empty to use the title.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Show Open Button Title", TEXT_DOMAIN)}
                  checked={
                    showOpenButtonTitle === undefined || showOpenButtonTitle
                  }
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
                    "Override the default open button icon. Leave empty to use the default icon.",
                    TEXT_DOMAIN,
                  )}
                />
                <CheckboxControl
                  label={__("Show Open Button Icon", TEXT_DOMAIN)}
                  checked={
                    showOpenButtonIcon === undefined || showOpenButtonIcon
                  }
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
              </>
            )}
            <CheckboxControl
              label={__("Show Search Button Title", TEXT_DOMAIN)}
              checked={
                showSearchButtonTitle === undefined || showSearchButtonTitle
              }
              onChange={(value) => {
                setAttributes({
                  showSearchButtonTitle:
                    value !== undefined ? value : showSearchButtonTitle,
                });
              }}
              help={__(
                "Toggle to show or hide the search button title.",
                TEXT_DOMAIN,
              )}
            />
            <TextControl
              label={__("Custom Search Button Icon", TEXT_DOMAIN)}
              value={searchButtonIcon || ""}
              placeholder="<svg>...</svg>"
              onChange={(value) => {
                setAttributes({ searchButtonIcon: value });
              }}
              help={__(
                "Override the default search button icon. Leave empty to use the current mode’s default icon.",
                TEXT_DOMAIN,
              )}
            />
            <CheckboxControl
              label={__("Show Search Button Icon", TEXT_DOMAIN)}
              checked={
                showSearchButtonIcon === undefined || showSearchButtonIcon
              }
              onChange={(value) => {
                setAttributes({
                  showSearchButtonIcon:
                    value !== undefined ? value : showSearchButtonIcon,
                });
              }}
              help={__(
                "Toggle to show or hide the search button icon.",
                TEXT_DOMAIN,
              )}
            />
          </PanelBody>
          <PanelBody title={__("Search Configuration", TEXT_DOMAIN)}>
            <TextControl
              label={__("Result Count (Top K)", TEXT_DOMAIN)}
              value={topK !== undefined ? topK.toString() : ""}
              onChange={(value) => {
                const num = parseInt(value);
                setAttributes({ topK: isNaN(num) ? undefined : num });
              }}
              help={__(
                "Set the maximum number of search results to return (Top K). Leave empty for the default value.",
                TEXT_DOMAIN,
              )}
            />
            <Divider />
            <TextControl
              label={__("Snippet Max Characters", TEXT_DOMAIN)}
              value={
                snippetMaxChars !== undefined ? snippetMaxChars.toString() : ""
              }
              onChange={(value) => {
                const num = parseInt(value);
                setAttributes({
                  snippetMaxChars: isNaN(num) ? undefined : num,
                });
              }}
              help={__(
                "Set the maximum number of characters for each search result snippet. Leave empty for the default value.",
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
                  colorMode: value as DocSearchArgs["colorMode"],
                });
              }}
              help={__(
                "Select the AI-Kit Doc Search block’s color scheme—Light, Dark, or Auto (follows the user’s system preference).",
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
                "Set the primary color for the AI-Kit Doc Search block (default Mantine colors and your custom colors).",
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
              label={__("Theme Overrides", TEXT_DOMAIN)}
              __nextHasNoMarginBottom
              value={themeOverrides || ""}
              onChange={(v) => setAttributes({ themeOverrides: v })}
              help={__(
                "Add scoped CSS to the AI-Kit Doc Search block’s inner container—primarily to override design tokens (--ai-kit, --mantine), but you can include other styles too.",
                TEXT_DOMAIN,
              )}
            />
          </PanelBody>
        </InspectorControls>
        {fulfilledStore ? (
          <App
            isPreview={true}
            store={fulfilledStore}
            inputSelector={inputSelector}
            variation={variation || "default"}
            autoRun={autoRun}
            language={language || "en"}
            direction={themeDirection || "auto"}
            title={title}
            showOpenButton={showOpenButton}
            openButtonTitle={openButtonTitle}
            showOpenButtonTitle={showOpenButtonTitle}
            openButtonIcon={openButtonIcon}
            showOpenButtonIcon={showOpenButtonIcon}
            showSearchButtonTitle={showSearchButtonTitle}
            searchButtonIcon={searchButtonIcon}
            showSearchButtonIcon={showSearchButtonIcon}
            colorMode={colorMode || "auto"}
            primaryColor={primaryColor}
            primaryShade={primaryShade}
            colors={colors}
            themeOverrides={themeOverrides}
            topK={topK}
            snippetMaxChars={snippetMaxChars}
          />
        ) : (
          <>
            {__(
              "Please configure the AI-Kit Doc Search block settings.",
              TEXT_DOMAIN,
            )}
          </>
        )}
      </div>
    </div>
  );
};

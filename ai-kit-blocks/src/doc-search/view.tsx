import "jquery";

import { DocSearchArgs, getStore } from "@smart-cloud/ai-kit-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import YAML from "yaml";
import { App } from "./app";

const cache = new Map<string, string>();

const decodeB64Utf8 = (b64: string): string => {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
};

const toCamelKey = (key: string): string => {
  const k = key.trim();
  if (!k) return k;
  // input_selector / input-selector -> inputSelector
  const norm = k.replace(/-/g, "_");
  const parts = norm.split("_").filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
};

const fromYaml = <T,>(
  yamlConfig: Record<string, unknown> | undefined,
  key: string,
): T | undefined => {
  if (!yamlConfig) return undefined;

  // case-insensitive + snake/kebab -> camel
  const direct =
    yamlConfig[key] ??
    yamlConfig[key.toLowerCase()] ??
    yamlConfig[toCamelKey(key)] ??
    yamlConfig[toCamelKey(key).toLowerCase()];

  return direct as T | undefined;
};

const parseJsonAttribute = <T,>(value: string | null): T | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(atob(value)) as T;
  } catch (error) {
    console.warn("Invalid JSON data attribute", error);
    return undefined;
  }
};

try {
  const call = async (id: string) => {
    const el = document.querySelector("#" + id) as Element | null;
    if (el) {
      const store = await getStore();
      jQuery(el).data("rendered", "true");

      const configB64 = el.getAttribute("data-config-b64");
      const configFormat = el.getAttribute("data-config-format") ?? "yaml.v1";

      let yamlConfig: Record<string, unknown> | undefined;
      if (configB64) {
        try {
          const raw = decodeB64Utf8(configB64);
          if (configFormat.startsWith("yaml")) {
            const parsed = YAML.parse(raw);
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              yamlConfig = parsed as Record<string, unknown>;
            }
          }
        } catch (e) {
          console.warn("Invalid shortcode config", e);
        }
      }
      const isPreview = el.getAttribute("data-is-preview") === "true";

      const yamlInputSelector = fromYaml<string>(yamlConfig, "inputSelector");
      const inputSelector =
        yamlInputSelector ??
        el.getAttribute("data-input-selector") ??
        undefined;

      const yamlAutoRun = fromYaml<DocSearchArgs["autoRun"]>(
        yamlConfig,
        "autoRun",
      );
      const autoRun =
        yamlAutoRun ?? el.getAttribute("data-auto-run") !== undefined
          ? el.getAttribute("data-auto-run") === "true"
          : undefined;

      const yamlEnableUserFilters = fromYaml<
        DocSearchArgs["enableUserFilters"]
      >(yamlConfig, "enableUserFilters");
      const enableUserFilters =
        yamlEnableUserFilters ??
        el.getAttribute("data-enable-user-filters") !== undefined
          ? el.getAttribute("data-enable-user-filters") === "true"
          : undefined;

      const yamlVariation = fromYaml<DocSearchArgs["variation"]>(
        yamlConfig,
        "variation",
      );
      const variation =
        yamlVariation ??
        (el.getAttribute("data-variation") as DocSearchArgs["variation"]);

      const yamlLanguage = fromYaml<DocSearchArgs["language"]>(
        yamlConfig,
        "language",
      );
      const language =
        yamlLanguage ??
        (el.getAttribute("data-language") as DocSearchArgs["language"]);

      const yamlDirection = fromYaml<DocSearchArgs["direction"]>(
        yamlConfig,
        "direction",
      );
      const direction =
        yamlDirection ??
        (el.getAttribute("data-direction") as
          | DocSearchArgs["direction"]
          | "auto");

      const yamlTitle = fromYaml<DocSearchArgs["title"]>(yamlConfig, "title");
      const title = yamlTitle ?? el.getAttribute("data-title") ?? undefined;

      const yamlShowOpenButton = fromYaml<DocSearchArgs["showOpenButton"]>(
        yamlConfig,
        "showOpenButton",
      );
      const showOpenButton =
        yamlShowOpenButton ??
        (el.getAttribute("data-show-open-button") !== undefined
          ? el.getAttribute("data-show-open-button") === "true"
          : undefined);

      const yamlOpenButtonTitle = fromYaml<DocSearchArgs["openButtonTitle"]>(
        yamlConfig,
        "openButtonTitle",
      );
      const openButtonTitle =
        yamlOpenButtonTitle ??
        el.getAttribute("data-open-button-title") ??
        undefined;

      const yamlShowOpenButtonTitle = fromYaml<
        DocSearchArgs["showOpenButtonTitle"]
      >(yamlConfig, "showOpenButtonTitle");
      const showOpenButtonTitle =
        yamlShowOpenButtonTitle ??
        (el.getAttribute("data-show-open-button-title") !== undefined
          ? el.getAttribute("data-show-open-button-title") === "true"
          : undefined);

      const yamlOpenButtonIcon = fromYaml<DocSearchArgs["openButtonIcon"]>(
        yamlConfig,
        "openButtonIcon",
      );
      const openButtonIcon =
        yamlOpenButtonIcon ??
        el.getAttribute("data-open-button-icon") ??
        undefined;

      const yamlShowOpenButtonIcon = fromYaml<
        DocSearchArgs["showOpenButtonIcon"]
      >(yamlConfig, "showOpenButtonIcon");
      const showOpenButtonIcon =
        yamlShowOpenButtonIcon ??
        (el.getAttribute("data-show-open-button-icon") !== undefined
          ? el.getAttribute("data-show-open-button-icon") === "true"
          : undefined);

      const yamlTopK = fromYaml<DocSearchArgs["topK"]>(yamlConfig, "topK");
      const topK =
        yamlTopK ??
        (el.getAttribute("data-top-k")
          ? parseInt(el.getAttribute("data-top-k")!)
          : undefined);

      const yamlSnippetMaxChars = fromYaml<DocSearchArgs["snippetMaxChars"]>(
        yamlConfig,
        "snippetMaxChars",
      );
      const snippetMaxChars =
        yamlSnippetMaxChars ??
        (el.getAttribute("data-snippet-max-chars")
          ? parseInt(el.getAttribute("data-snippet-max-chars")!)
          : undefined);

      const yamlShowSearchButtonTitle = fromYaml<
        DocSearchArgs["showSearchButtonTitle"]
      >(yamlConfig, "showSearchButtonTitle");
      const showSearchButtonTitle =
        yamlShowSearchButtonTitle ??
        (el.getAttribute("data-show-search-button-title") !== undefined
          ? el.getAttribute("data-show-search-button-title") === "true"
          : undefined);

      const yamlSearchButtonIcon = fromYaml<DocSearchArgs["searchButtonIcon"]>(
        yamlConfig,
        "searchButtonIcon",
      );
      const searchButtonIcon =
        yamlSearchButtonIcon ??
        el.getAttribute("data-search-button-icon") ??
        undefined;

      const yamlShowSearchButtonIcon = fromYaml<
        DocSearchArgs["showSearchButtonIcon"]
      >(yamlConfig, "showSearchButtonIcon");
      const showSearchButtonIcon =
        yamlShowSearchButtonIcon ??
        (el.getAttribute("data-show-search-button-icon") !== undefined
          ? el.getAttribute("data-show-search-button-icon") === "true"
          : undefined);

      const yamlColorMode = fromYaml<DocSearchArgs["colorMode"]>(
        yamlConfig,
        "colorMode",
      );
      const colorMode =
        yamlColorMode ??
        (el.getAttribute("data-color-mode") as DocSearchArgs["colorMode"]);

      const yamlPrimaryColor = fromYaml<DocSearchArgs["primaryColor"]>(
        yamlConfig,
        "primaryColor",
      );
      const primaryColor =
        yamlPrimaryColor ??
        (el.getAttribute(
          "data-primary-color",
        ) as DocSearchArgs["primaryColor"]);

      let primaryShade = fromYaml<DocSearchArgs["primaryShade"]>(
        yamlConfig,
        "colors",
      );
      if (!primaryShade) {
        const primaryShadeAttr = el.getAttribute("data-primary-shade");
        primaryShade = (() => {
          if (!primaryShadeAttr) {
            return undefined;
          }
          const trimmed = primaryShadeAttr.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            const parsed =
              parseJsonAttribute<DocSearchArgs["primaryShade"]>(
                primaryShadeAttr,
              );
            if (parsed) {
              return parsed;
            }
          }
          return primaryShadeAttr as unknown as DocSearchArgs["primaryShade"];
        })();
      }

      const yamlColors = fromYaml<DocSearchArgs["colors"]>(
        yamlConfig,
        "colors",
      );
      let colors = yamlColors;
      if (!colors) {
        const colorsAttr = el.getAttribute("data-colors") ?? undefined;
        colors = (() => {
          if (!colorsAttr || typeof colorsAttr !== "object") {
            return undefined;
          }
          if (Array.isArray(colorsAttr)) {
            return undefined;
          }
          const normalised: Record<string, string> = {};
          const maybeName = (colorsAttr as Record<string, unknown>).name;
          const maybeColor = (colorsAttr as Record<string, unknown>).color;
          if (typeof maybeName === "string" && typeof maybeColor === "string") {
            if (maybeName) {
              normalised[maybeName] = maybeColor;
            }
          } else {
            Object.entries(colorsAttr as Record<string, unknown>).forEach(
              ([key, value]) => {
                if (typeof value === "string") {
                  normalised[key] = value;
                }
              },
            );
          }
          return Object.keys(normalised).length ? normalised : undefined;
        })();
      }

      const yamlThemeOverrides = fromYaml<string>(yamlConfig, "themeOverrides");
      const themeOverrides =
        yamlThemeOverrides ??
        el.getAttribute("data-theme-overrides") ??
        undefined;

      const root = createRoot(el);
      if (cache.has(id)) {
        el.innerHTML = cache.get(id) || "";
      } else {
        cache.set(id, el.innerHTML || "");
      }
      root.render(
        <StrictMode>
          <App
            isPreview={isPreview}
            inputSelector={inputSelector}
            store={store}
            variation={variation}
            autoRun={autoRun}
            enableUserFilters={enableUserFilters}
            language={language}
            direction={direction}
            title={title}
            showOpenButton={showOpenButton}
            openButtonTitle={openButtonTitle}
            showOpenButtonTitle={showOpenButtonTitle}
            openButtonIcon={openButtonIcon}
            showOpenButtonIcon={showOpenButtonIcon}
            showSearchButtonTitle={showSearchButtonTitle}
            searchButtonIcon={searchButtonIcon}
            showSearchButtonIcon={showSearchButtonIcon}
            colorMode={colorMode}
            primaryColor={primaryColor}
            colors={colors}
            primaryShade={primaryShade}
            themeOverrides={themeOverrides}
            topK={topK}
            snippetMaxChars={snippetMaxChars}
          />
        </StrictMode>,
      );
    }
  };

  jQuery(document).on("smartcloud-ai-kit-doc-search-block", (_, id) =>
    call(id),
  );
  jQuery(window).on("elementor/frontend/init", function () {
    jQuery(document).on("smartcloud-ai-kit-doc-search-block", (_, id) =>
      call(id),
    );
  });
} catch (err) {
  console.error(err);
}

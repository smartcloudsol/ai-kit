import "jquery";

import { AiFeatureArgs, getStore } from "@smart-cloud/ai-kit-core";
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

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

      const yamlOutputSelector = fromYaml<string>(yamlConfig, "outputSelector");
      const outputSelector =
        yamlOutputSelector ??
        el.getAttribute("data-output-selector") ??
        undefined;

      const yamlMode = fromYaml<AiFeatureArgs["mode"]>(yamlConfig, "mode");
      const mode =
        yamlMode ??
        (el.getAttribute("data-mode") as AiFeatureArgs["mode"]) ??
        undefined;

      const yamlEditable = fromYaml<AiFeatureArgs["editable"]>(
        yamlConfig,
        "editable",
      );
      const editable =
        yamlEditable ?? el.getAttribute("data-editable") !== undefined
          ? el.getAttribute("data-editable") === "true"
          : undefined;

      const yamlAutoRun = fromYaml<AiFeatureArgs["autoRun"]>(
        yamlConfig,
        "autoRun",
      );
      const autoRun =
        yamlAutoRun ?? el.getAttribute("data-auto-run") !== undefined
          ? el.getAttribute("data-auto-run") === "true"
          : undefined;

      const yamlVariation = fromYaml<AiFeatureArgs["variation"]>(
        yamlConfig,
        "variation",
      );
      const variation =
        yamlVariation ??
        (el.getAttribute("data-variation") as AiFeatureArgs["variation"]);

      const yamlLanguage = fromYaml<AiFeatureArgs["language"]>(
        yamlConfig,
        "language",
      );
      const language =
        yamlLanguage ??
        (el.getAttribute("data-language") as AiFeatureArgs["language"]);

      const yamlDirection = fromYaml<AiFeatureArgs["direction"]>(
        yamlConfig,
        "direction",
      );
      const direction =
        yamlDirection ??
        (el.getAttribute("data-direction") as
          | AiFeatureArgs["direction"]
          | "auto");

      const yamlTitle = fromYaml<AiFeatureArgs["title"]>(yamlConfig, "title");
      const title = yamlTitle ?? el.getAttribute("data-title") ?? undefined;

      const yamlOpenButtonTitle = fromYaml<AiFeatureArgs["openButtonTitle"]>(
        yamlConfig,
        "openButtonTitle",
      );
      const openButtonTitle =
        yamlOpenButtonTitle ??
        el.getAttribute("data-open-button-title") ??
        undefined;

      const yamlShowOpenButtonTitle = fromYaml<
        AiFeatureArgs["showOpenButtonTitle"]
      >(yamlConfig, "showOpenButtonTitle");
      const showOpenButtonTitle =
        yamlShowOpenButtonTitle ??
        (el.getAttribute("data-show-open-button-title") !== undefined
          ? el.getAttribute("data-show-open-button-title") === "true"
          : undefined);

      const yamlOpenButtonIcon = fromYaml<AiFeatureArgs["openButtonIcon"]>(
        yamlConfig,
        "openButtonIcon",
      );
      const openButtonIcon =
        yamlOpenButtonIcon ??
        el.getAttribute("data-open-button-icon") ??
        undefined;

      const yamlShowOpenButtonIcon = fromYaml<
        AiFeatureArgs["showOpenButtonIcon"]
      >(yamlConfig, "showOpenButtonIcon");
      const showOpenButtonIcon =
        yamlShowOpenButtonIcon ??
        (el.getAttribute("data-show-open-button-icon") !== undefined
          ? el.getAttribute("data-show-open-button-icon") === "true"
          : undefined);

      const yamlShowRegenerateOnBackendButton = fromYaml<
        AiFeatureArgs["showRegenerateOnBackendButton"]
      >(yamlConfig, "showRegenerateOnBackendButton");
      const showRegenerateOnBackendButton =
        yamlShowRegenerateOnBackendButton ??
        (el.getAttribute("data-show-regenerate-on-backend-button") !== undefined
          ? el.getAttribute("data-show-regenerate-on-backend-button") === "true"
          : undefined);

      const yamlAcceptButtonTitle = fromYaml<
        AiFeatureArgs["acceptButtonTitle"]
      >(yamlConfig, "acceptButtonTitle");
      const acceptButtonTitle =
        yamlAcceptButtonTitle ??
        el.getAttribute("data-accept-button-title") ??
        undefined;

      const yamlColorMode = fromYaml<AiFeatureArgs["colorMode"]>(
        yamlConfig,
        "colorMode",
      );
      const colorMode =
        yamlColorMode ??
        (el.getAttribute("data-color-mode") as AiFeatureArgs["colorMode"]);

      const yamlPrimaryColor = fromYaml<AiFeatureArgs["primaryColor"]>(
        yamlConfig,
        "primaryColor",
      );
      const primaryColor =
        yamlPrimaryColor ??
        (el.getAttribute(
          "data-primary-color",
        ) as AiFeatureArgs["primaryColor"]);

      let primaryShade = fromYaml<AiFeatureArgs["primaryShade"]>(
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
              parseJsonAttribute<AiFeatureArgs["primaryShade"]>(
                primaryShadeAttr,
              );
            if (parsed) {
              return parsed;
            }
          }
          return primaryShadeAttr as unknown as AiFeatureArgs["primaryShade"];
        })();
      }

      const yamlColors = fromYaml<AiFeatureArgs["colors"]>(
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

      const yamlOptionsDisplay = fromYaml<AiFeatureArgs["optionsDisplay"]>(
        yamlConfig,
        "optionsDisplay",
      );
      const optionsDisplay =
        yamlOptionsDisplay ??
        (el.getAttribute(
          "data-options-display",
        ) as AiFeatureArgs["optionsDisplay"]);

      const yamlDefaults = fromYaml<
        Partial<NonNullable<AiFeatureArgs["default"]>>
      >(yamlConfig, "default");
      const defaults =
        yamlDefaults ??
        parseJsonAttribute<Partial<NonNullable<AiFeatureArgs["default"]>>>(
          el.getAttribute("data-default"),
        ) ??
        undefined;

      const yamlAllowOverride = fromYaml<Partial<Record<string, unknown>>>(
        yamlConfig,
        "allowOverride",
      );
      const allowOverride =
        yamlAllowOverride ??
        parseJsonAttribute<Partial<Record<string, unknown>>>(
          el.getAttribute("data-allow-override"),
        ) ??
        undefined;

      const yamlThemeOverrides = fromYaml<string>(yamlConfig, "themeOverrides");
      const themeOverrides =
        yamlThemeOverrides ??
        el.getAttribute("data-theme-overrides") ??
        undefined;

      const yamlOnDeviceTimeout = fromYaml<number>(
        yamlConfig,
        "onDeviceTimeout",
      );
      const onDeviceTimeout =
        toNumberOrUndefined(yamlOnDeviceTimeout) ??
        toNumberOrUndefined(el.getAttribute("data-on-device-timeout"));

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
            store={store}
            inputSelector={inputSelector}
            outputSelector={outputSelector}
            mode={mode}
            editable={editable}
            autoRun={autoRun}
            variation={variation}
            language={language}
            direction={direction}
            title={title}
            openButtonTitle={openButtonTitle}
            showOpenButtonTitle={showOpenButtonTitle}
            openButtonIcon={openButtonIcon}
            showOpenButtonIcon={showOpenButtonIcon}
            showRegenerateOnBackendButton={showRegenerateOnBackendButton}
            acceptButtonTitle={acceptButtonTitle}
            colorMode={colorMode}
            primaryColor={primaryColor}
            colors={colors}
            primaryShade={primaryShade}
            optionsDisplay={optionsDisplay}
            default={defaults}
            allowOverride={allowOverride}
            themeOverrides={themeOverrides}
            onDeviceTimeout={onDeviceTimeout}
          />
        </StrictMode>,
      );
    }
  };

  jQuery(document).on("wpsuite-ai-kit-feature-block", (_, id) => call(id));
  jQuery(window).on("elementor/frontend/init", function () {
    jQuery(document).on("wpsuite-ai-kit-feature-block", (_, id) => call(id));
  });
} catch (err) {
  console.error(err);
}

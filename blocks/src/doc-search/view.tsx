import "jquery";

import { getStore } from "@smart-cloud/ai-kit-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import YAML from "yaml";
import { beginMount, endMount, resetMount } from "../shared/mountGuard";
import { App } from "./app";

const cache = new Map<string, string>();

const decodeB64Utf8 = (b64: string): string => {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
};

try {
  const call = async (id: string) => {
    const el = document.querySelector("#" + id) as Element | null;
    if (el) {
      if (!beginMount(id, el)) {
        return;
      }

      try {
        const store = await getStore();

        // Simple decode of single data-config attribute
        const configAttr = el.getAttribute("data-config");
        let config = configAttr ? JSON.parse(atob(configAttr)) : {};

        // If there's YAML config from shortcode, parse and merge it
        if (config.configB64) {
          try {
            const raw = decodeB64Utf8(config.configB64);
            if ((config.configFormat || "yaml.v1").startsWith("yaml")) {
              const yamlConfig = YAML.parse(raw);
              if (
                yamlConfig &&
                typeof yamlConfig === "object" &&
                !Array.isArray(yamlConfig)
              ) {
                // YAML overrides config attributes
                config = { ...config, ...yamlConfig };
              }
            }
          } catch (e) {
            console.warn("Invalid shortcode YAML config", e);
          }
          // Clean up internal fields
          delete config.configB64;
          delete config.configFormat;
        }

        // Type normalization: convert string values to proper types
        // Boolean fields from switcher controls
        const booleanFields = [
          "autoRun",
          "enableUserFilters",
          "showOpenButton",
          "showOpenButtonTitle",
          "showOpenButtonIcon",
          "showSearchButtonTitle",
          "showSearchButtonIcon",
        ];
        for (const field of booleanFields) {
          if (field in config) {
            const val = config[field];
            if (val === "true" || val === true) {
              config[field] = true;
            } else if (val === "false" || val === false) {
              config[field] = false;
            } else if (val === "" || val === null || val === undefined) {
              delete config[field];
            }
          }
        }

        // Number fields
        const numberFields = ["topK", "snippetMaxChars"];
        for (const field of numberFields) {
          if (field in config && typeof config[field] === "string") {
            const num = parseInt(config[field], 10);
            if (!isNaN(num)) {
              config[field] = num;
            }
          }
        }

        // Remove null/empty values that shouldn't be passed to component
        for (const key of Object.keys(config)) {
          if (config[key] === null || config[key] === "") {
            delete config[key];
          }
        }

        const isPreview = el.getAttribute("data-is-preview") === "true";

        const root = createRoot(el);
        if (cache.has(id)) {
          el.innerHTML = cache.get(id) || "";
        } else {
          cache.set(id, el.innerHTML || "");
        }
        root.render(
          <StrictMode>
            <App isPreview={isPreview} store={store} {...config} />
          </StrictMode>,
        );
      } catch (error) {
        resetMount(el);
        throw error;
      } finally {
        endMount(id);
      }
    }
  };

  jQuery(document).on("smartcloud-ai-kit-doc-search-block", (_, id) =>
    call(id),
  );
} catch (err) {
  console.error(err);
}

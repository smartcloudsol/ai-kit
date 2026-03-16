import "jquery";

import { getStore } from "@smart-cloud/ai-kit-core";
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

try {
  const call = async (id: string) => {
    const el = document.querySelector("#" + id) as Element | null;
    if (el) {
      const store = await getStore();
      jQuery(el).data("rendered", "true");

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
    }
  };

  jQuery(document).on("smartcloud-ai-kit-feature-block", (_, id) => call(id));
  jQuery(window).on("elementor/frontend/init", function () {
    jQuery(document).on("smartcloud-ai-kit-feature-block", (_, id) => call(id));
  });
} catch (err) {
  console.error(err);
}

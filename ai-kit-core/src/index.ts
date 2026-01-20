import {
  attachDefaultPluginRuntime,
  TEXT_DOMAIN,
} from "@smart-cloud/wpsuite-core";
import { __ } from "@wordpress/i18n";
import {
  getAiKitPlugin,
  getStore,
  waitForAiKitReady,
  type AiKitErrorEvent,
  type AiKitPlugin,
  type AiKitReadyEvent,
} from "./runtime";
import { createStore } from "./store";
import {
  AiFeatureArgs,
  AiKitLanguageCode,
  AiWorkerHandle,
  type Backend,
  type Capabilities,
  type Features,
} from "./types";

export {
  getAiKitPlugin,
  getStore,
  TEXT_DOMAIN,
  waitForAiKitReady,
  type AiKitErrorEvent,
  type AiKitPlugin,
  type AiKitReadyEvent,
};

export {
  getStoreDispatch,
  getStoreSelect,
  observeStore,
  sanitizeAiKitConfig,
  type AiKitConfig,
  type CustomTranslations,
  type State,
  type Store,
} from "./store";

export * from "./types";
export * from "./icons";

export const LANGUAGE_OPTIONS: { label: string; value: AiKitLanguageCode }[] = [
  { label: __("Arabic", TEXT_DOMAIN), value: "ar" },
  { label: __("Chinese", TEXT_DOMAIN), value: "zh" },
  { label: __("Dutch", TEXT_DOMAIN), value: "nl" },
  { label: __("English", TEXT_DOMAIN), value: "en" },
  { label: __("French", TEXT_DOMAIN), value: "fr" },
  { label: __("German", TEXT_DOMAIN), value: "de" },
  { label: __("Hebrew", TEXT_DOMAIN), value: "he" },
  { label: __("Hindi", TEXT_DOMAIN), value: "hi" },
  { label: __("Hungarian", TEXT_DOMAIN), value: "hu" },
  { label: __("Indonesian", TEXT_DOMAIN), value: "id" },
  { label: __("Italian", TEXT_DOMAIN), value: "it" },
  { label: __("Japanese", TEXT_DOMAIN), value: "ja" },
  { label: __("Korean", TEXT_DOMAIN), value: "ko" },
  { label: __("Norwegian", TEXT_DOMAIN), value: "no" },
  { label: __("Polish", TEXT_DOMAIN), value: "pl" },
  { label: __("Portuguese", TEXT_DOMAIN), value: "pt" },
  { label: __("Russian", TEXT_DOMAIN), value: "ru" },
  { label: __("Spanish", TEXT_DOMAIN), value: "es" },
  { label: __("Swedish", TEXT_DOMAIN), value: "sv" },
  { label: __("Thai", TEXT_DOMAIN), value: "th" },
  { label: __("Turkish", TEXT_DOMAIN), value: "tr" },
  { label: __("Ukrainian", TEXT_DOMAIN), value: "uk" },
];

const capabilities: Promise<Capabilities> = import(
  __WPSUITE_PREMIUM__ ? "./protected/capabilities" : "./public/capabilities"
);
export const getMinChromeVersions = async () => {
  const module = await capabilities;
  return module.MIN_CHROME_VERSION;
};
export const decideCapability = async (
  ...args: Parameters<Capabilities["decideCapability"]>
) => {
  const module = await capabilities;
  return module.decideCapability(...args);
};
export const checkOnDeviceAvailability = async (
  ...args: Parameters<Capabilities["checkOnDeviceAvailability"]>
) => {
  const module = await capabilities;
  return module.checkOnDeviceAvailability(...args);
};

const backend: Promise<Backend<unknown>> = import(
  __WPSUITE_PREMIUM__ ? "./protected/backend" : "./public/backend"
);
export const dispatchBackend = async (
  ...args: Parameters<Backend<unknown>["dispatchBackend"]>
) => {
  const module = await backend;
  return module.dispatchBackend(...args);
};

const features: Promise<Features> = import(
  __WPSUITE_PREMIUM__ ? "./protected/features" : "./public/features"
);
export const getWriteOptions = async (
  ...args: Parameters<Features["getWriteOptions"]>
) => {
  const module = await features;
  return module.getWriteOptions(...args);
};
export const write = async (...args: Parameters<Features["write"]>) => {
  const module = await features;
  return module.write(...args);
};
export const getRewriteOptions = async (
  ...args: Parameters<Features["getRewriteOptions"]>
) => {
  const module = await features;
  return module.getRewriteOptions(...args);
};
export const rewrite = async (...args: Parameters<Features["rewrite"]>) => {
  const module = await features;
  return module.rewrite(...args);
};
export const getProofreadOptions = async (
  ...args: Parameters<Features["getProofreadOptions"]>
) => {
  const module = await features;
  return module.getProofreadOptions(...args);
};
export const proofread = async (...args: Parameters<Features["proofread"]>) => {
  const module = await features;
  return module.proofread(...args);
};
export const getSummarizeOptions = async (
  ...args: Parameters<Features["getSummarizeOptions"]>
) => {
  const module = await features;
  return module.getSummarizeOptions(...args);
};
export const summarize = async (...args: Parameters<Features["summarize"]>) => {
  const module = await features;
  return module.summarize(...args);
};
export const getTranslateOptions = async (
  ...args: Parameters<Features["getTranslateOptions"]>
) => {
  const module = await features;
  return module.getTranslateOptions(...args);
};
export const translate = async (...args: Parameters<Features["translate"]>) => {
  const module = await features;
  return module.translate(...args);
};
export const detectLanguage = async (
  ...args: Parameters<Features["detectLanguage"]>
) => {
  const module = await features;
  return module.detectLanguage(...args);
};
export const getPromptOptions = async (
  ...args: Parameters<Features["getPromptOptions"]>
) => {
  const module = await features;
  return module.getPromptOptions(...args);
};
export const prompt = async (...args: Parameters<Features["prompt"]>) => {
  const module = await features;
  return module.prompt(...args);
};

export const initializeAiKit = (
  renderFeature: (args: AiFeatureArgs) => Promise<AiWorkerHandle>,
): AiKitPlugin => {
  const wp = globalThis.WpSuite;
  const aiKit = getAiKitPlugin();
  if (!aiKit) {
    console.error("AiKit plugin is not available");
    throw new Error("AiKit plugin is not available");
  }
  attachDefaultPluginRuntime(aiKit);
  aiKit.status = aiKit.status ?? "initializing";
  const store = createStore();
  aiKit.features = {
    store,
    renderFeature: async (args: AiFeatureArgs) => {
      return await renderFeature({ ...args, store: await store });
    },
    write: async (...args: Parameters<Features["write"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.write(...args);
    },
    rewrite: async (...args: Parameters<Features["rewrite"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.rewrite(...args);
    },
    proofread: async (...args: Parameters<Features["proofread"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.proofread(...args);
    },
    summarize: async (...args: Parameters<Features["summarize"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.summarize(...args);
    },
    translate: async (...args: Parameters<Features["translate"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.translate(...args);
    },
    detectLanguage: async (...args: Parameters<Features["detectLanguage"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.detectLanguage(...args);
    },
    prompt: async (...args: Parameters<Features["prompt"]>) => {
      const module = await features;
      const options = args[1] || {};
      args[1] = { context: "frontend", ...options };
      return module.prompt(...args);
    },
  };

  store
    .then(() => {
      aiKit.status = "available";
      wp?.events?.emit("wpsuite:ai-kit:ready", {
        key: aiKit.key,
        version: aiKit.version,
      });
    })
    .catch((err) => {
      aiKit.status = "error";
      console.error("AiKit plugin failed to initialize:", err);
      wp?.events?.emit("wpsuite:ai-kit:error", {
        key: aiKit.key,
        error: String(err),
      });
    });

  return aiKit;
};

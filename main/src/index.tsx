import {
  AiChatbotProps,
  AiFeatureArgs,
  AiKitConfig,
  AiWorkerHandle,
  AiWorkerProps,
  AnyCreateCoreOptions,
  BuiltInAiFeature,
  decideCapability,
  DocSearchArgs,
  getPromptOptions,
  getProofreadOptions,
  getRewriteOptions,
  getStore,
  getStoreSelect,
  getSummarizeOptions,
  getTranslateOptions,
  getWriteOptions,
  initializeAiKit,
  observeStore,
  isOnDeviceLanguageSupported,
  PromptArgs,
  RewriteArgs,
  SummarizeArgs,
  TranslateArgs,
  WriteArgs,
  type AiFeatureProps,
} from "@smart-cloud/ai-kit-core";
import { useSelect } from "@wordpress/data";
import React, { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import "jquery";

import "@smart-cloud/ai-kit-ui/styles.css";

import { observe } from "./observer";

// UI vendor code is needed by a rendered feature, not by the global SDK API.
let uiVendorPromise: Promise<void> | undefined;
async function ensureUiVendor(): Promise<void> {
  const runtime = globalThis as unknown as {
    WpSuiteMantine?: unknown;
    WpSuite?: { constants?: { aiKit?: { mantineJsHref?: string } } };
  };
  if (runtime.WpSuiteMantine) return;
  if (!uiVendorPromise) {
    const url = runtime.WpSuite?.constants?.aiKit?.mantineJsHref;
    if (!url) throw new Error("AI Kit UI vendor URL is unavailable.");
    uiVendorPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => {
        if (runtime.WpSuiteMantine) resolve();
        else { script.remove(); reject(new Error("AI Kit UI vendor did not initialize.")); }
      };
      script.onerror = () => { script.remove(); reject(new Error("AI Kit UI vendor could not be loaded.")); };
      document.head.appendChild(script);
    }).catch((error: unknown) => { uiVendorPromise = undefined; throw error; });
  }
  return uiVendorPromise;
}

function onDomReady(fn: () => void) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

// ---- Global function implementation ----
async function renderFeature(args: AiFeatureArgs): Promise<AiWorkerHandle> {
  let outputLanguage =
    (args as Partial<WriteArgs | RewriteArgs | SummarizeArgs | PromptArgs>)
      .outputLanguage || "en";
  if (!isOnDeviceLanguageSupported(outputLanguage)) {
    outputLanguage = "en";
  }
  let feature: BuiltInAiFeature;
  let options: AnyCreateCoreOptions;
  switch (args.mode) {
    case "write":
      feature = "writer";
      options =
        (await getWriteOptions?.({
          ...args,
          outputLanguage,
        } as Partial<WriteArgs>)) ?? {};
      break;
    case "rewrite":
      feature = "rewriter";
      options =
        (await getRewriteOptions?.({
          ...args,
          outputLanguage,
        } as Partial<RewriteArgs>)) ?? {};
      break;
    case "proofread":
      feature = "proofreader";
      options = (await getProofreadOptions?.()) ?? {};
      break;
    case "summarize":
      feature = "summarizer";
      options =
        (await getSummarizeOptions?.({
          ...args,
          outputLanguage,
        } as Partial<SummarizeArgs>)) ?? {};
      break;
    case "translate":
      feature = "translator";
      options = await getTranslateOptions?.(args as Partial<TranslateArgs>);
      break;
    case "generatePostMetadata":
    case "generateImageMetadata":
      feature = "prompt";
      options = await getPromptOptions?.({
        ...args,
        outputLanguage,
      } as Partial<PromptArgs>);
      break;
    default:
      throw new Error(`Unknown AI feature mode: ${args.mode}`);
  }

  const capability = await decideCapability(
    feature,
    options,
    args.modeOverride,
  );
  if (!capability.onDeviceAvailable && !capability.backendAvailable) {
    throw new Error(
      `AI feature "${feature}" is not available, reason: ${capability.reason}`,
    );
  }
  await ensureUiVendor();
  const AiFeature = (
    await import(/* webpackChunkName: "ai-kit-ui" */ "@smart-cloud/ai-kit-ui")
  ).AiFeature;

  const { target, onAccept, onClose, ...aiFeatureProps } = args;

  const host =
    (typeof target === "string" ? document.querySelector(target) : target) ??
    document.body;

  const container = document.createElement("div");
  host.appendChild(container);

  let root: Root | null = createRoot(container);

  const cleanup = () => {
    try {
      root?.unmount();
    } catch {
      // ignore
    }
    root = null;
    container.remove();
  };

  const handleClose = () => {
    // first call user's onClose (so they can react), then cleanup
    try {
      onClose?.();
    } finally {
      cleanup();
    }
  };

  // allow programmatic close from returned handle
  const handle: AiWorkerHandle = {
    container,
    close: handleClose,
    unmount: cleanup,
  };

  root.render(
    <StrictMode>
      <AiFeature
        context="frontend"
        {...(aiFeatureProps as AiFeatureProps)}
        onClose={handleClose}
        onAccept={onAccept}
      />
    </StrictMode>,
  );

  return handle;
}

const ChatbotComponent = (
  props: AiChatbotProps & { Component: React.ComponentType<AiChatbotProps> },
): JSX.Element => {
  const { Component, store } = props;

  const config: AiKitConfig | null = useSelect(() =>
    getStoreSelect(store).getConfig(),
  );

  const showChatbotPreview: boolean = useSelect(() =>
    getStoreSelect(store).isShowChatbotPreview(),
  );

  if (!config?.enableChatbot || showChatbotPreview) {
    return <></>;
  }

  return <Component {...props} {...config?.chatbot} />;
};

async function renderSearchComponent(
  args: DocSearchArgs,
): Promise<AiWorkerHandle> {
  await ensureUiVendor();
  const DocSearch = (
    await import(/* webpackChunkName: "ai-kit-ui" */ "@smart-cloud/ai-kit-ui")
  ).DocSearch;

  const { target, onClickDoc, onClose, ...docSearchProps } = args;

  const host =
    (typeof target === "string" ? document.querySelector(target) : target) ??
    document.body;

  const container = document.createElement("div");
  host.appendChild(container);

  let root: Root | null = createRoot(container);

  const cleanup = () => {
    try {
      root?.unmount();
    } catch {
      // ignore
    }
    root = null;
    container.remove();
  };

  const handleClose = () => {
    try {
      onClose?.();
    } finally {
      cleanup();
    }
  };

  const handle: AiWorkerHandle = {
    container,
    close: handleClose,
    unmount: cleanup,
  };

  root.render(
    <StrictMode>
      <DocSearch
        context="frontend"
        {...docSearchProps}
        onClose={handleClose}
        onClickDoc={onClickDoc}
      />
    </StrictMode>,
  );

  return handle;
}

async function renderChatbot(args: AiWorkerProps): Promise<AiWorkerHandle> {
  await ensureUiVendor();
  const AiChatbot = (
    await import(/* webpackChunkName: "ai-kit-ui" */ "@smart-cloud/ai-kit-ui")
  ).AiChatbot;

  const { onClose, ...aiChatbotProps } = args;

  const host = document.body;

  const container = document.createElement("div");
  container.style.zIndex = "2147483647"; // max z-index
  host.appendChild(container);

  const root: Root | null = createRoot(container);

  const handleClose = () => {
    // first call user's onClose (so they can react), then cleanup
    try {
      onClose?.();
    } catch {
      // ignore
    }
  };

  // allow programmatic close from returned handle
  const handle: AiWorkerHandle = {
    container,
    close: handleClose,
    unmount: () => void 0,
  };

  root.render(
    <StrictMode>
      <ChatbotComponent
        Component={AiChatbot}
        context="frontend"
        {...aiChatbotProps}
        onClose={handleClose}
        previewMode={false}
      />
    </StrictMode>,
  );

  return handle;
}

onDomReady(async () => {
  initializeAiKit(renderFeature, renderSearchComponent);
  observe();
  getStore().then((store) => {
    let mounted = false;
    const mountChatbot = (enabled: unknown) => {
      if (!enabled || mounted) return;
      mounted = true;
      renderChatbot({ store, onClose: () => void 0 }).catch((error: unknown) => {
        mounted = false;
        console.error("AI Kit chatbot could not be mounted:", error);
      });
    };
    const enabled = () => getStoreSelect(store).getConfig()?.enableChatbot;
    mountChatbot(enabled());
    observeStore(store, enabled, mountChatbot);
  });
});

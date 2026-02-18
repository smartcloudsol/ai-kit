import {
  AiChatbotProps,
  AiFeatureArgs,
  AiKitConfig,
  DocSearchArgs,
  AiWorkerHandle,
  AiWorkerProps,
  AnyCreateCoreOptions,
  BuiltInAiFeature,
  decideCapability,
  getPromptOptions,
  getProofreadOptions,
  getRewriteOptions,
  getStore,
  getStoreSelect,
  getSummarizeOptions,
  getTranslateOptions,
  getWriteOptions,
  initializeAiKit,
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
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";

import "jquery";

import "@smart-cloud/ai-kit-ui/styles.css";

import { observe } from "./observer";

function onDomReady(fn: () => void) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

// ---- Global function implementation ----
async function renderFeature(args: AiFeatureArgs): Promise<AiWorkerHandle> {
  let feature: BuiltInAiFeature;
  let options: AnyCreateCoreOptions;
  switch (args.mode) {
    case "write":
      feature = "writer";
      options = (await getWriteOptions?.(args as Partial<WriteArgs>)) ?? {};
      break;
    case "rewrite":
      feature = "rewriter";
      options = (await getRewriteOptions?.(args as Partial<RewriteArgs>)) ?? {};
      break;
    case "proofread":
      feature = "proofreader";
      options = (await getProofreadOptions?.()) ?? {};
      break;
    case "summarize":
      feature = "summarizer";
      options =
        (await getSummarizeOptions?.(args as Partial<SummarizeArgs>)) ?? {};
      break;
    case "translate":
      feature = "translator";
      options = await getTranslateOptions?.(args as Partial<TranslateArgs>);
      break;
    case "generatePostMetadata":
    case "generateImageMetadata":
      feature = "prompt";
      options = await getPromptOptions?.(args as Partial<PromptArgs>);
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
      `AI feature "${feature}" is not available (reason: ${capability.reason})`,
    );
  }
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
        {...aiChatbotProps}
        onClose={handleClose}
        previewMode={false}
      />
    </StrictMode>,
  );

  return handle;
}

onDomReady(async () => {
  const aiKit = initializeAiKit(renderFeature, renderSearchComponent);
  observe();
  getStore().then((store) => {
    renderChatbot({ store, onClose: () => void 0 });
  });

  if (
    aiKit.settings?.reCaptchaSiteKey &&
    !document.querySelector(
      `[smartcloud-wpsuite-recaptcha-provider-${aiKit.settings.reCaptchaSiteKey}]`,
    )
  ) {
    const el = document.createElement("div");
    el.id = "smartcloud-ai-kit-recaptcha-provider";
    el.setAttribute(
      `smartcloud-wpsuite-recaptcha-provider-${aiKit.settings.reCaptchaSiteKey}`,
      "true",
    );
    document.body.appendChild(el);
    const observer = new MutationObserver(() => {
      const badge = document.querySelector(".grecaptcha-badge");
      if (badge) {
        (badge as HTMLElement).style.visibility = "hidden";
        (badge as HTMLElement).style.display = "none";
        //observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    createRoot(el).render(
      <StrictMode>
        <GoogleReCaptchaProvider
          reCaptchaKey={aiKit.settings.reCaptchaSiteKey}
          useEnterprise={aiKit.settings.useRecaptchaEnterprise}
          useRecaptchaNet={aiKit.settings.useRecaptchaNet}
          scriptProps={{ async: true, defer: true }}
        >
          <></>
        </GoogleReCaptchaProvider>
      </StrictMode>,
    );
  }
});

import {
  AiFeatureArgs,
  AiWorkerHandle,
  AnyCreateCoreOptions,
  BuiltInAiFeature,
  decideCapability,
  getPromptOptions,
  getProofreadOptions,
  getRewriteOptions,
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
import { StrictMode } from "react";
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
  container.setAttribute("data-wpsuite-ai-feature", "1");
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

onDomReady(async () => {
  const aiKit = initializeAiKit(renderFeature);
  observe();

  if (
    aiKit.settings?.reCaptchaSiteKey &&
    !document.querySelector(
      `[wpsuite-recaptcha-provider='${aiKit.settings.reCaptchaSiteKey}']`,
    )
  ) {
    const el = document.createElement("div");
    el.setAttribute(
      "wpsuite-recaptcha-provider",
      aiKit.settings.reCaptchaSiteKey,
    );
    document.body.appendChild(el);
    createRoot(el).render(
      <StrictMode>
        <GoogleReCaptchaProvider
          reCaptchaKey={aiKit.settings.reCaptchaSiteKey}
          useEnterprise={aiKit.settings.useRecaptchaEnterprise}
          useRecaptchaNet={aiKit.settings.useRecaptchaNet}
        >
          <></>
        </GoogleReCaptchaProvider>
      </StrictMode>,
    );
  }
});

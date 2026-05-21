import { WpSuitePluginBase } from "@smart-cloud/wpsuite-core";
import { AiKit } from "./index";

// ai-kit-core/src/runtime.ts
export type AiKitReadyEvent = "wpsuite:ai-kit:ready";
export type AiKitErrorEvent = "wpsuite:ai-kit:error";

export type AiKitPlugin = WpSuitePluginBase & AiKit;
export function getAiKitPlugin(): AiKitPlugin {
  return globalThis.WpSuite?.plugins?.aiKit as AiKitPlugin;
}

export async function waitForAiKitReady(timeoutMs = 8000): Promise<void> {
  const plugin = getAiKitPlugin();
  if (plugin?.status === "available") return;
  if (plugin?.status === "error") throw new Error("AiKit failed");

  await new Promise<void>((resolve, reject) => {
    const onReady = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(new Error("AiKit failed")));
    const cleanup = (fn: () => void) => {
      window.removeEventListener("wpsuite:ai-kit:ready", onReady);
      window.removeEventListener("wpsuite:ai-kit:error", onError);
      if (t) clearTimeout(t);
      fn();
    };

    window.addEventListener("wpsuite:ai-kit:ready", onReady, { once: true });
    window.addEventListener("wpsuite:ai-kit:error", onError, { once: true });

    const t = timeoutMs
      ? window.setTimeout(
          () => cleanup(() => reject(new Error("AiKit timeout"))),
          timeoutMs
        )
      : 0;
  });
}

export async function getStore(timeoutMs = 10000) {
  await waitForAiKitReady(timeoutMs);

  const plugin = getAiKitPlugin();
  const storePromise = plugin?.features?.store;

  if (!storePromise) throw new Error("AiKit store is not available");
  return storePromise; // Promise<Store>
}

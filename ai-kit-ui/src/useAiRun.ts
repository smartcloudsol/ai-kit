import {
  AiKitLanguageCode,
  AiKitPlugin,
  AiKitSettings,
  getAiKitPlugin,
  getStoreSelect,
  type AiKitConfig,
  type AiKitStatusEvent,
} from "@smart-cloud/ai-kit-core";
import { getWpSuite } from "@smart-cloud/wpsuite-core";
import { useCallback, useRef, useState } from "react";

export type AiRunState<T> = {
  busy: boolean;
  error: string | null;
  statusEvent: AiKitStatusEvent | null;
  result: T | null;
  isCancelled: boolean;
  /** Last known execution source (best-effort). */
  lastSource: "on-device" | "backend" | null;
};

export type AiFeatureFunction<T> = (args: {
  signal: AbortSignal;
  onStatus: (e: AiKitStatusEvent) => void;
}) => Promise<T>;

export type UseAiRunResult<T> = AiRunState<T> & {
  run: (func: AiFeatureFunction<T>) => Promise<T | null>;
  cancel: () => void;
  reset: () => void;
  /** Current AbortSignal, if a run is in-flight. */
  signal: AbortSignal | null;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

/**
 * Returns true if backend routing is configured in the current AiKit settings.
 *
 * This is intentionally conservative: it only checks *configuration*, not reachability.
 */
export async function isBackendConfigured(): Promise<boolean> {
  const store = await getAiKitPlugin().features.store;
  if (!store) {
    return false;
  }
  const s: AiKitConfig = getStoreSelect(store).getConfig() ?? {};
  if (s.backendTransport === "gatey") {
    return Boolean(s.backendApiName);
  }
  if (s.backendTransport === "fetch") {
    return Boolean(s.backendBaseUrl);
  }
  // Unknown/undefined transport: treat as not configured.
  return false;
}

export function readDefaultOutputLanguage(): AiKitLanguageCode {
  const aiKit = getWpSuite()?.plugins?.aiKit as AiKitPlugin | undefined;
  return (
    ((aiKit?.settings ?? {}) as AiKitSettings).defaultOutputLanguage ?? "en"
  );
}

/**
 * Removes a single surrounding Markdown code fence.
 *
 * Handles common model outputs like:
 * ```json
 * {"a":1}
 * ```
 */
export function stripCodeFence(text: string): string {
  const fence = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;
  const m = text.match(fence);
  return m ? m[1] : text;
}

export function useAiRun<T>(): UseAiRunResult<T> {
  const ctrlRef = useRef<AbortController | null>(null);
  const lastSourceRef = useRef<"on-device" | "backend" | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusEvent, setStatusEvent] = useState<AiKitStatusEvent | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [lastSource, setLastSource] = useState<"on-device" | "backend" | null>(
    null,
  );

  const cancel = useCallback(() => {
    ctrlRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setBusy(false);
    setError(null);
    setStatusEvent(null);
    setResult(null);
    setIsCancelled(false);
    lastSourceRef.current = null;
    setLastSource(null);
  }, []);

  const run = useCallback(
    async (func: AiFeatureFunction<T>): Promise<T | null> => {
      // Cancel any ongoing run
      ctrlRef.current?.abort();

      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      setBusy(true);
      setError(null);
      setStatusEvent(null);
      setResult(null);
      setIsCancelled(false);
      lastSourceRef.current = null;
      setLastSource(null);

      try {
        const value = await func({
          signal: ctrl.signal,
          onStatus: (e) => {
            setStatusEvent(e);
            if (e.source === "on-device" || e.source === "backend") {
              lastSourceRef.current = e.source;
              setLastSource(e.source);
            }
          },
        });
        setResult(value);
        return value;
      } catch (err) {
        if (ctrl.signal.aborted) {
          setIsCancelled(true);
          setError(null);
          return null;
        }
        setError(getErrorMessage(err));
        return null;
      } finally {
        setBusy(false);
        setStatusEvent(null);
      }
    },
    [],
  );

  // NOTE: do not memoize; ctrlRef changes don't trigger rerender.
  const signal = ctrlRef.current?.signal ?? null;

  return {
    busy,
    error,
    statusEvent,
    result,
    isCancelled,
    lastSource,
    run,
    cancel,
    reset,
    signal,
  };
}

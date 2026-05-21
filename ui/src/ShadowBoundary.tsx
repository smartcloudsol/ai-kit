import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  SetStateAction,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ShadowBoundaryMode = "local" | "overlay";

export type ShadowBoundaryProps = {
  /** Stylesheets to inject into the shadow root (as <link rel="stylesheet">). */
  stylesheets: string[];

  /** ID of the element inside the shadow root used as the portal target. */
  rootElementId: string;

  /** Variation of the shadow boundary behavior. */
  variation?: "default" | "modal";
  /**
   * Where to create the shadow root:
   * - "local": attach shadow to this component's host element (keeps layout positioning).
   * - "overlay": attach shadow to a singleton element in top (or self) document (always on top).
   */
  mode?: ShadowBoundaryMode;

  /**
   * For mode="overlay": host id in the top (or self) document.
   * Same id everywhere => singleton overlay host.
   */
  overlayRootId?: string;

  setHost: React.Dispatch<SetStateAction<HTMLElement | null>>;
  children: (api: {
    /** Portal target element inside the shadow root. */
    rootElement: HTMLDivElement;
    /** Shadow root instance. */
    shadowRoot: ShadowRoot;
  }) => React.ReactNode;
};

function getTopDocumentSafe(): Document {
  try {
    return window.top?.document ?? window.document;
  } catch {
    return window.document;
  }
}

function ensureStylesheets(
  doc: Document,
  container: HTMLElement,
  shadow: ShadowRoot,
  hrefs: string[],
) {
  for (const href of hrefs) {
    const id = `ai-kit-style-${btoa(href).replace(/=+$/g, "")}`;
    if (shadow.getElementById(id)) continue;
    const link = doc.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    container.appendChild(link);
  }
}

const REGISTRY_ID = "ai-kit-property-registry";

function installAiKitPropertyRegistry(doc: Document) {
  if (doc.getElementById(REGISTRY_ID)) return;

  const style = doc.createElement("style");
  style.id = REGISTRY_ID;
  style.textContent = `
@property --ai-kit-border-angle {
  syntax: "<angle>";
  inherits: true;
  initial-value: 0deg;
}
`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

export function ShadowBoundary({
  stylesheets,
  children,
  rootElementId,
  mode = "local",
  overlayRootId = "ai-kit-overlay-root",
  setHost,
}: ShadowBoundaryProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  // Combine built-in + external stylesheets; stable key so callers don't need to memoize arrays.
  const stylesKey = useMemo(() => {
    const all = [...stylesheets];
    return all.join("|");
  }, [stylesheets]);

  useLayoutEffect(() => {
    if (!hostRef.current) return;

    const doc =
      mode === "overlay" ? getTopDocumentSafe() : hostRef.current.ownerDocument;

    // 1) Decide overlay host vs local host
    let host: HTMLElement;
    if (mode === "overlay") {
      let overlayHost = doc.getElementById(
        overlayRootId,
      ) as HTMLDivElement | null;
      if (!overlayHost) {
        overlayHost = doc.createElement("div");
        overlayHost.id = overlayRootId;

        // Do not affect layout; allow overlays to sit above everything.
        overlayHost.style.position = "fixed";
        overlayHost.style.inset = "0";
        overlayHost.style.width = "0";
        overlayHost.style.height = "0";
        overlayHost.style.zIndex = "2147483647"; // max z-index
        overlayHost.style.pointerEvents = "none";

        doc.body.appendChild(overlayHost);
      }
      host = overlayHost;
    } else {
      host = hostRef.current;
    }
    setHost(host);

    // 2) Ensure shadow root
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    // 3) Ensure portal target div
    let rootEl = shadow.querySelector(
      `#${CSS.escape(rootElementId)}`,
    ) as HTMLDivElement | null;
    if (!rootEl) {
      rootEl = doc.createElement("div");
      rootEl.id = rootElementId;
      rootEl.style.margin = "0";

      // Overlay host itself has pointerEvents:none; allow content to receive events.
      if (mode === "overlay") {
        rootEl.style.pointerEvents = "auto";
      }
      shadow.appendChild(rootEl);
    }

    const readScheme = () => rootEl.getAttribute("data-mantine-color-scheme");
    const readVariation = () => rootEl.getAttribute("data-ai-kit-variation");

    const applyScheme = () => {
      host.setAttribute("data-ai-kit-variation", readVariation() || "default");
      host.setAttribute("data-mantine-color-scheme", readScheme() || "auto");
    };

    applyScheme();

    // 4) Watch for scheme/variation changes
    const mo = new MutationObserver(applyScheme);
    mo.observe(rootEl, {
      attributes: true,
      attributeFilter: ["data-mantine-color-scheme"],
    });

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMq = () => applyScheme();
    mq?.addEventListener?.("change", onMq);

    installAiKitPropertyRegistry(doc);

    // 5) Inject styles into shadow body (dedup per shadow root)
    ensureStylesheets(
      doc,
      rootEl,
      shadow,
      stylesKey ? stylesKey.split("|") : [],
    );

    setShadowRoot(shadow);
    setPortalTarget(rootEl);

    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", onMq);
    };
  }, [mode, overlayRootId, rootElementId, stylesKey]);

  const emotionCache = useMemo(() => {
    if (!portalTarget) return null;
    // IMPORTANT: container must be an HTMLElement inside the shadow tree.
    return createCache({
      key: mode === "overlay" ? "ai-kit-ov" : "ai-kit-local",
      container: portalTarget,
    });
  }, [portalTarget, mode]);

  return (
    <div
      ref={hostRef}
      style={{
        outline: "none",
        boxShadow: "none",
        backgroundColor: "transparent",
      }}
    >
      {portalTarget && shadowRoot && emotionCache
        ? createPortal(
            <CacheProvider value={emotionCache}>
              {children({ rootElement: portalTarget, shadowRoot })}
            </CacheProvider>,
            portalTarget,
          )
        : null}
    </div>
  );
}

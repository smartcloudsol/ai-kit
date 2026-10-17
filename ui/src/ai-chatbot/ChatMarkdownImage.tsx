import { Modal } from "@mantine/core";
import { createContext, useContext, useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";

export interface ChatMarkdownImageLabels {
  enlarge: string;
  close: string;
  preview: string;
  unavailable: string;
}

/** Authored block labels can override these without changing runtime language. */
export const ChatMarkdownImageLabelsContext = createContext<ChatMarkdownImageLabels>({
  enlarge: "Enlarge image",
  close: "Close image preview",
  preview: "Image preview",
  unavailable: "Image unavailable",
});

/** ReactMarkdown has already sanitized src; do not introduce another URL or srcSet. */
export function ChatMarkdownImage({ src, alt, title, labels: suppliedLabels }: ComponentPropsWithoutRef<"img"> & ExtraProps & {
  labels?: Partial<ChatMarkdownImageLabels>;
}) {
  const defaults = useContext(ChatMarkdownImageLabelsContext);
  const labels = { ...defaults, ...suppliedLabels };
  const [opened, setOpened] = useState(false);
  const [failedSource, setFailedSource] = useState<string>();
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement>();
  const trigger = useRef<HTMLButtonElement>(null);
  // Keep the overlay outside clipped/transformed message bubbles while retaining
  // the shell's stylesheet boundary. Mantine owns focus trapping; restoration
  // targets the exact trigger because document.activeElement is a shadow host.
  useEffect(() => {
    const button = trigger.current;
    if (!button) return;
    const root = button.getRootNode();
    const target = button.ownerDocument.createElement("div");
    target.className = "ai-chat-image-portal";
    if (root.nodeType === 11) root.appendChild(target);
    else button.ownerDocument.body.appendChild(target);
    setPortalTarget(target);
    return () => { target.remove(); };
  }, [src]);
  useEffect(() => {
    if (!opened) return;
    const root = trigger.current?.getRootNode();
    // Window capture listeners see the shadow host, not the focused button.
    // Do not let Escape close the containing chatbot as well as this preview.
    if (!root || root.nodeType !== 11 || !("host" in root)) return;
    const host = (root as ShadowRoot).host;
    const previous = host.getAttribute("data-mantine-stop-propagation");
    host.setAttribute("data-mantine-stop-propagation", "true");
    return () => {
      if (previous === null) host.removeAttribute("data-mantine-stop-propagation");
      else host.setAttribute("data-mantine-stop-propagation", previous);
    };
  }, [opened]);
  const fail = () => { setFailedSource(src); setOpened(false); };
  if (!src || failedSource === src) {
    return <span className="ai-chat-image-unavailable" role="img" aria-label={alt || labels.unavailable}>{alt || labels.unavailable}</span>;
  }
  return <>
    <button ref={trigger} type="button" className="ai-chat-image-trigger" aria-label={alt ? `${labels.enlarge}: ${alt}` : labels.enlarge}
      aria-haspopup="dialog" onClick={() => setOpened(true)}>
      <img className="ai-chat-markdown-image" src={src} alt={alt || ""} title={title} loading="lazy" decoding="async" onError={fail} />
    </button>
    <Modal opened={opened && !!portalTarget} onClose={() => setOpened(false)} title={alt || labels.preview}
      centered size="auto" withinPortal portalProps={{ target: portalTarget }} zIndex={100004}
      trapFocus returnFocus={false} closeOnEscape={false} closeOnClickOutside lockScroll
      onExitTransitionEnd={() => trigger.current?.focus({ preventScroll: true })}
      data-mantine-stop-propagation="true"
      onKeyDownCapture={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.stopPropagation();
          setOpened(false);
        }
      }}
      closeButtonProps={{ "aria-label": labels.close, ...{ "data-mantine-stop-propagation": "true" } }}
      classNames={{ inner: "ai-chat-image-modal-inner", content: "ai-chat-image-modal", body: "ai-chat-image-modal-body", header: "ai-chat-image-modal-header", title: "ai-chat-image-modal-title" }}>
      <button type="button" className="ai-chat-image-dismiss" aria-label={labels.close} data-mantine-stop-propagation="true" onClick={() => setOpened(false)}>
        <img src={src} alt={alt || ""} decoding="async" onError={fail} />
      </button>
    </Modal>
  </>;
}

/** A Markdown linked image must not produce an interactive button inside a link. */
export function ChatMarkdownLink({ children, node, ...props }: ComponentPropsWithoutRef<"a"> & ExtraProps) {
  const containsImage = (child: NonNullable<ExtraProps["node"]>["children"][number]): boolean =>
    child.type === "element" && (child.tagName === "img" || child.children.some(containsImage));
  if (node?.children.some(containsImage)) {
    return <span className="ai-chat-linked-image">{children}</span>;
  }
  return <a {...props}>{children}</a>;
}

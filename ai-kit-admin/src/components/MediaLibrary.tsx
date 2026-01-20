import { AiWorkerHandle, TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import apiFetch from "@wordpress/api-fetch";
import { Button, Spinner } from "@wordpress/components";
import { createRoot } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import React, { useCallback, useEffect, useState } from "react";
import GenerateMetadataBox from "./GenerateMetadataBox";
import { WordPressMedia } from "./types";

function mountReact(el: Element, node: React.ReactElement) {
  const anyEl = el as HTMLElement & {
    __aiKitRoot?: ReturnType<typeof createRoot>;
  };
  if (anyEl.__aiKitRoot) {
    return;
  }
  const root = createRoot(el as HTMLElement);
  anyEl.__aiKitRoot = root;
  root.render(node);
}

function extractAttachmentIdFromDetails(
  detailsEl: Element,
  inActionsBlock: boolean = true,
): number | null {
  const links = Array.from(
    detailsEl.querySelectorAll(
      `${inActionsBlock ? ".actions" : ""} a[href*='post.php?post=']`,
    ),
  );
  for (const a of links) {
    try {
      const href = (a as HTMLAnchorElement).href;
      const u = new URL(href);
      const p = u.searchParams.get("post");
      if (p && /^\d+$/.test(p)) return parseInt(p, 10);
    } catch (err) {
      console.error(err);
    }
  }
  return null;
}

function ensureModalBox() {
  const details = document.querySelector(".media-modal .attachment-details");
  if (!details) return;

  let id = extractAttachmentIdFromDetails(details);
  if (!id) id = extractAttachmentIdFromDetails(details, false);
  if (!id) return;

  // insert before image info block (Uploaded on/by / file name)
  const info = details.querySelector(".attachment-info");
  if (!info) return;

  let host = details.querySelector("#ai-kit-media-modal-box");
  if (!host) {
    host = document.createElement("div");
    host.id = "ai-kit-media-modal-box";
    host.setAttribute("style", "margin: 0 0 10px 0;");
    info.parentElement?.insertBefore(host, info);
  }

  mountReact(
    host,
    <GenerateMetadataBox attachmentId={id} autoSaveToAttachment={true} />,
  );
}

function isGridBulkSelectMode(): boolean {
  const toggle = document.querySelector(".select-mode-toggle-button");
  if (!toggle) return false;

  const pressed = toggle.getAttribute("aria-pressed");
  if (pressed === "true") return true;

  return /cancel/i.test((toggle.textContent || "").trim());
}

function getGridSelectedIds(): number[] {
  return Array.from(
    document.querySelectorAll("ul.attachments li.attachment.selected"),
  )
    .map((el) => parseInt(el.getAttribute("data-id") || "", 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function MediaLibrary(props: { ids: number[]; onClose: () => void }) {
  const [handle, setHandle] = useState<AiWorkerHandle>();
  const { ids, onClose } = props;
  const [idx, setIdx] = useState(0);
  const id = ids[idx];

  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<WordPressMedia | null>(null);

  const fetchMedia = useCallback(async () => {
    setBusy(true);
    try {
      const m = (await apiFetch({
        path: `/wp/v2/media/${id}`,
      })) as WordPressMedia;
      setMedia(m);
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const url = media?.source_url as string | undefined;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        // close on background click
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(1100px, 96vw)",
          height: "min(700px, 92vh)",
          background: "#fff",
          borderRadius: 8,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
        }}
      >
        <div
          style={{
            padding: 12,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="secondary" onClick={onClose}>
              {__("Close", TEXT_DOMAIN)}
            </Button>
            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
              {idx + 1} / {ids.length} (ID: {id})
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex" }}>
            {busy ? (
              <Spinner />
            ) : media?.description?.rendered ? (
              <div
                style={{ display: "flex", flexDirection: "column" }}
                dangerouslySetInnerHTML={{
                  __html: media?.description?.rendered || "",
                }}
              />
            ) : (
              <div>{__("No preview.", TEXT_DOMAIN)}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button
              variant="secondary"
              onClick={() => {
                handle?.close();
                setHandle(undefined);
                setIdx((v) => Math.max(0, v - 1));
              }}
              disabled={idx === 0}
            >
              {__("Prev", TEXT_DOMAIN)}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                handle?.close();
                setHandle(undefined);
                setIdx((v) => Math.min(ids.length - 1, v + 1));
              }}
              disabled={idx === ids.length - 1}
            >
              {__("Next", TEXT_DOMAIN)}
            </Button>
          </div>
        </div>

        <div
          style={{
            padding: 12,
            overflow: "auto",
            borderLeft: "1px solid #eee",
          }}
        >
          <GenerateMetadataBox
            attachmentId={id}
            imageUrl={url}
            autoSaveToAttachment={true}
            handle={handle}
            setHandle={setHandle}
            onGenerated={() => {
              fetchMedia();
              handle?.close();
              setHandle(undefined);
            }}
          />
          {media && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "#f9f9f9",
                border: "1px solid #eee",
                borderRadius: 4,
                fontSize: 12,
                display: "grid",
                gap: 6,
              }}
            >
              {[
                { label: __("ID", TEXT_DOMAIN), value: media.id },
                {
                  label: __("Source URL", TEXT_DOMAIN),
                  value: media.source_url,
                },
                { label: __("Alt text", TEXT_DOMAIN), value: media.alt_text },
                {
                  label: __("Title", TEXT_DOMAIN),
                  value: media.title?.rendered,
                },
              ].map(({ label, value }) => {
                const display =
                  value !== undefined &&
                  value !== null &&
                  `${value}`.trim() !== ""
                    ? value
                    : "—";
                return (
                  <div key={label} style={{ display: "flex", gap: 8 }}>
                    <strong style={{ minWidth: 120 }}>{label}:</strong>
                    <span
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {display}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ensureGridBulkButton() {
  // only show button in bulk-select mode
  if (!isGridBulkSelectMode()) {
    const old = document.getElementById("ai-kit-grid-preview-btn");
    if (old) old.remove();
    return;
  }

  const deleteBtn = document.querySelector(
    ".delete-selected-button",
  ) as HTMLButtonElement | null;
  if (!deleteBtn) return;

  let btn = document.getElementById(
    "ai-kit-grid-preview-btn",
  ) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "ai-kit-grid-preview-btn";
    btn.type = "button";
    btn.className = "button button-primary";
    btn.textContent = __("Preview SEO metadata", TEXT_DOMAIN);

    // small adjustment for WP admin toolbar
    btn.style.margin = "10px 8px";
    btn.style.verticalAlign = "middle";
    btn.style.position = "relative";

    deleteBtn.parentElement?.insertBefore(btn, deleteBtn);

    btn.addEventListener("click", () => {
      const ids = getGridSelectedIds();
      if (!ids.length) return;

      const hostId = "ai-kit-bulk-overlay-host";
      let host = document.getElementById(hostId);
      if (!host) {
        host = document.createElement("div");
        host.id = hostId;
        document.body.appendChild(host);
      }

      mountReact(
        host,
        <MediaLibrary ids={ids} onClose={() => host?.remove()} />,
      );
    });
  }

  btn.disabled = getGridSelectedIds().length === 0;
}

function initObservers() {
  // Media modal + grid UI continuous refresh
  const obs = new MutationObserver(() => {
    ensureModalBox();
    ensureGridBulkButton();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // refresh on click is needed to catch selection changes
  document.addEventListener(
    "click",
    () => {
      setTimeout(() => {
        ensureModalBox();
        ensureGridBulkButton();
      }, 0);
    },
    true,
  );

  ensureModalBox();
  ensureGridBulkButton();
}

function initAttachmentMetabox() {
  const host = document.getElementById("ai-kit-attachment-metabox-root");
  if (!host) return;

  const idStr = host.getAttribute("data-attachment-id") || "";
  const id = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null;
  if (!id) return;

  mountReact(
    host,
    <GenerateMetadataBox attachmentId={id} autoSaveToAttachment={true} />,
  );
}

function maybeStartBulkFromQuery() {
  const p = new URLSearchParams(window.location.search);
  if (p.get("ai_kit_preview") !== "1") return;

  const ids = (p.get("ai_kit_ids") || "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!ids.length) return;

  const hostId = "ai-kit-bulk-overlay-host";
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement("div");
    host.id = hostId;
    document.body.appendChild(host);
  }

  mountReact(host, <MediaLibrary ids={ids} onClose={() => host?.remove()} />);

  // cleanup URL (do not pop up again on refresh)
  p.delete("ai_kit_preview");
  p.delete("ai_kit_ids");
  const qs = p.toString();
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname + (qs ? `?${qs}` : ""),
  );
}

// --- boot ---
(function boot() {
  initObservers();

  // upload.php (Media Library)
  if (document.body.classList.contains("upload-php")) {
    maybeStartBulkFromQuery();
  }

  // post.php attachment edit screen (metabox)
  if (document.body.classList.contains("post-php")) {
    initAttachmentMetabox();
  }
})();

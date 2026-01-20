import {
  AiWorkerHandle,
  getAiKitPlugin,
  TEXT_DOMAIN,
} from "@smart-cloud/ai-kit-core";
import { readDefaultOutputLanguage } from "@smart-cloud/ai-kit-ui";
import apiFetch from "@wordpress/api-fetch";
import { Button, Notice } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { useCallback, useMemo, useState } from "react";

type WpGlobal = {
  media?: {
    attachment?: (id: number) => {
      fetch?: (options?: unknown) => void;
      set?: (attrs: Record<string, unknown>) => void;
      trigger?: (event: string) => void;
    };
  };
  data?: {
    dispatch?: (store: string) => {
      editPost?: (updates: Record<string, unknown>) => void;
    };
  };
};

function getWp(): WpGlobal | undefined {
  return (globalThis as unknown as { wp?: WpGlobal }).wp;
}

type GeneratedImageMetadata = {
  alt_text?: string;
  title?: string;
  caption?: string;
  description?: string;
};

type GenerateMetadataBoxProps = {
  attachmentId?: number;
  imageUrl?: string;

  /** If true and attachmentId is set, Accept will save to /wp/v2/media. */
  autoSaveToAttachment?: boolean;

  editable?: boolean;

  handle?: AiWorkerHandle | undefined;
  setHandle?: React.Dispatch<React.SetStateAction<AiWorkerHandle | undefined>>;

  /** Optional callback with generated data. */
  onGenerated?: (data: GeneratedImageMetadata) => void;
};

async function resolveImageUrlFromAttachment(
  attachmentId: number,
): Promise<string | undefined> {
  try {
    const media = (await apiFetch({
      path: `/wp/v2/media/${attachmentId}?context=edit`,
      method: "GET",
    })) as unknown as {
      source_url?: string;
      media_details?: { sizes?: { full?: { source_url?: string } } };
      guid?: { rendered?: string };
    };

    return (
      media?.source_url ||
      media?.media_details?.sizes?.full?.source_url ||
      media?.guid?.rendered
    );
  } catch (e) {
    console.warn("AI Kit: failed to resolve attachment image URL", e);
    return undefined;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`Failed to fetch image: HTTP ${res.status}`);
  }
  return await res.blob();
}

async function updateMediaAttachment(
  attachmentId: number,
  data: GeneratedImageMetadata,
): Promise<void> {
  await apiFetch({
    path: `/wp/v2/media/${attachmentId}`,
    method: "POST",
    data: {
      alt_text: data.alt_text ?? "",
      title: data.title ?? "",
      caption: data.caption ?? "",
      description: data.description ?? "",
    },
  });

  // Best-effort refresh in Media modal/list cache (if available)
  try {
    const wp = getWp();
    const model = wp?.media?.attachment?.(attachmentId);

    let updated = false;
    // 1) Update the backbone model if present
    if (model?.set) {
      model.set({
        alt: data.alt_text ?? "",
        title: data.title ?? "",
        caption: data.caption ?? "",
        description: data.description ?? "",
      });
      updated = true;
    }

    // 2) Invalidate entity cache (block-editor contexts)
    const editPostDispatch = wp?.data?.dispatch?.("core/editor");
    if (editPostDispatch?.editPost) {
      const updates: {
        title?: string;
        caption?: string;
        description?: string;
        meta?: Record<string, unknown>;
      } = {};

      if (typeof data.title === "string") {
        updates.title = data.title;
      }
      if (typeof data.caption === "string") {
        updates.caption = data.caption;
      }
      if (typeof data.description === "string") {
        updates.description = data.description;
      }

      const metaUpdates: Record<string, unknown> = {};
      if (typeof data.alt_text === "string") {
        metaUpdates._wp_attachment_image_alt = data.alt_text;
      }

      if (Object.keys(metaUpdates).length > 0) {
        updates.meta = metaUpdates;
      }

      if (Object.keys(updates).length > 0) {
        editPostDispatch.editPost(updates);
        updated = true;
      }
    }

    // 3) Emit a custom event for any listeners (our overlays)
    document.dispatchEvent(
      new CustomEvent("ai-kit:attachment-updated", {
        detail: { id: attachmentId, data },
      }),
    );
    if (!updated && window.location.href.includes("post.php")) {
      // In post edit screen, refresh to update sidebar details
      window.location.reload();
    }
  } catch (err) {
    console.warn("AI Kit: failed to refresh media UI", err);
  }
}

export default function GenerateMetadataBox(props: GenerateMetadataBoxProps) {
  const {
    attachmentId,
    imageUrl,
    autoSaveToAttachment = true,
    onGenerated,
    handle,
    setHandle,
  } = props;

  const [image, setImage] = useState<Blob>();
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string>();
  const canRun = useMemo(
    () => Boolean(attachmentId || imageUrl),
    [attachmentId, imageUrl],
  );

  const accept = useCallback(
    async (generated: unknown) => {
      if (!generated || typeof generated !== "object") return;

      const data = generated as GeneratedImageMetadata;

      try {
        if (autoSaveToAttachment && attachmentId) {
          await updateMediaAttachment(attachmentId, data);
        }
        onGenerated?.(data);
        setModalOpen(false);
      } catch (e) {
        console.error("AI Kit: failed to save generated metadata", e);
      }
    },
    [autoSaveToAttachment, attachmentId, onGenerated],
  );

  return (
    <div
      className="ai-kit-generate-metadata-box"
      style={{ display: "grid", gap: 8 }}
    >
      {!canRun ? (
        <Notice status="warning" isDismissible={false}>
          {__("No image available.", TEXT_DOMAIN)}
        </Notice>
      ) : null}

      <Button
        variant="primary"
        onClick={async () => {
          if (modalOpen || handle) return;
          let url = imageUrl;
          if (!url && attachmentId) {
            url = await resolveImageUrlFromAttachment(attachmentId);
          }

          if (url) {
            try {
              setImage(await fetchImageBlob(url));
              setError(undefined);
              setModalOpen(true);
            } catch (e) {
              console.warn(
                "AI Kit: image fetch failed; continuing without images",
                e,
              );
            }
          }
        }}
        disabled={!canRun}
      >
        {__("Generate SEO metadata", TEXT_DOMAIN)}
      </Button>

      {error ? (
        <>
          <div style={{ marginTop: "12px" }}></div>
          <Notice
            status="error"
            isDismissible={true}
            onDismiss={() => setError(undefined)}
          >
            {error}
          </Notice>
        </>
      ) : null}

      {modalOpen && (
        <div
          ref={async (ref) => {
            if (!ref || handle) return;
            const h = await getAiKitPlugin()
              .features.renderFeature({
                colorMode: "light",
                primaryColor: "blue",
                context: "admin",
                store: await getAiKitPlugin().features.store,
                target: ref!,
                mode: "generateImageMetadata",
                default: {
                  image,
                  outputLanguage: readDefaultOutputLanguage(),
                },
                variation: "default",
                autoRun: false,
                editable: true,
                showOpenButton: false,
                onClose: () => {
                  setModalOpen(false);
                },
                onAccept: accept,
                acceptButtonTitle: __("Apply to post", TEXT_DOMAIN),
              })
              .catch((error) => {
                console.error(error.message);
                setError(__(error.message, TEXT_DOMAIN));
                setModalOpen(false);
              });
            if (h) {
              setHandle?.(h);
            }
          }}
        ></div>
      )}
    </div>
  );
}

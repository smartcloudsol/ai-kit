import type { KBPublishStatus } from "./types";

type Translate = (text: string, domain: string) => string;

// Use one exhaustive mapping for list badges and server-side filter values.
export function kbSourceStatusPresentation(__: Translate, domain: string) {
  return {
    needs_review: { label: __("Needs Review", domain), color: "orange" },
    ready_to_publish: {
      label: __("Ready to Publish", domain),
      color: "yellow",
    },
    published: { label: __("Published", domain), color: "green" },
    sync_pending: { label: __("Awaiting sync", domain), color: "yellow" },
    sync_running: { label: __("Syncing", domain), color: "blue" },
    sync_delivered: { label: __("Delivered", domain), color: "teal" },
    sync_error: { label: __("Sync error", domain), color: "red" },
    sync_blocked: { label: __("Sync blocked", domain), color: "red" },
    sync_removed: { label: __("Removed from sync", domain), color: "gray" },
  } satisfies Record<KBPublishStatus, { label: string; color: string }>;
}

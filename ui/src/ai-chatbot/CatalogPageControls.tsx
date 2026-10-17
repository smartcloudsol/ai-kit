import { useEffect, useState } from "react";
import { parseCatalogPage, type CatalogPage } from "@smart-cloud/ai-kit-core";
import { useAiKitI18n } from "../locale";

export interface CatalogPageLabels {
  catalogPreviousLabel: string;
  catalogNextLabel: string;
  catalogResultsLabel: string;
  catalogOfLabel: string;
  catalogMoreAvailableLabel: string;
  catalogExpiredLabel: string;
}

export function catalogPageNavigation(input: unknown, direction: "next" | "previous", busy: boolean, now = Date.now()): string | undefined {
  const page = parseCatalogPage(input);
  if (!page || busy || now >= page.expiresAt * 1000) return undefined;
  return direction === "next" ? page.nextHandle : page.previousHandle;
}

export function CatalogPageControls({ page: input, labels: sourceLabels, busy = false, onNavigate }: {
  page: CatalogPage;
  labels: CatalogPageLabels;
  busy?: boolean;
  onNavigate: (handle: string, label: string) => void;
}) {
  const I18n = useAiKitI18n();
  const labels: CatalogPageLabels = {
    catalogPreviousLabel: I18n.get(sourceLabels.catalogPreviousLabel),
    catalogNextLabel: I18n.get(sourceLabels.catalogNextLabel),
    catalogResultsLabel: I18n.get(sourceLabels.catalogResultsLabel),
    catalogOfLabel: I18n.get(sourceLabels.catalogOfLabel),
    catalogMoreAvailableLabel: I18n.get(sourceLabels.catalogMoreAvailableLabel),
    catalogExpiredLabel: I18n.get(sourceLabels.catalogExpiredLabel),
  };
  // Persisted history and server responses cross the same validation boundary.
  const page = parseCatalogPage(input);
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = page?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const remaining = expiresAt * 1000 - Date.now();
    if (remaining <= 0) {
      if (now < expiresAt * 1000) setNow(Date.now());
      return;
    }
    const timer = globalThis.setTimeout(() => setNow(Date.now()), Math.min(remaining, 2_147_483_647));
    return () => globalThis.clearTimeout(timer);
  }, [expiresAt, now]);
  if (!page) return null;
  const expired = now >= page.expiresAt * 1000;
  const navigate = (direction: "next" | "previous", label: string) => {
    // Check again at the click boundary; browser timers may be delayed in a background tab.
    const handle = catalogPageNavigation(page, direction, busy);
    if (!handle) return;
    onNavigate(handle, label);
  };
  return <div className="ai-catalog-page-controls" aria-busy={busy || undefined} data-expired={expired || undefined}>
    <span className="ai-catalog-page-summary" role="status" aria-live="polite">
      {labels.catalogResultsLabel}: {page.returnedCount}
      {page.totalCount !== undefined ? <> {labels.catalogOfLabel} {page.totalCount}</> : null}
      {page.hasMore ? <> · {labels.catalogMoreAvailableLabel}</> : null}
    </span>
    <div className="ai-catalog-page-actions">
    <button type="button" disabled={busy || expired || !page.previousHandle}
      onClick={() => navigate("previous", labels.catalogPreviousLabel)}>
      {labels.catalogPreviousLabel}
    </button>
    <button type="button" disabled={busy || expired || !page.nextHandle}
      onClick={() => navigate("next", labels.catalogNextLabel)}>
      {labels.catalogNextLabel}
    </button>
    </div>
    {expired ? <span className="ai-catalog-page-expired" role="status">{labels.catalogExpiredLabel}</span> : null}
  </div>;
}

import type { ChatActivity } from "./chatStream";

/** Semantic labels are shipped UI copy; never render a remote tool description. */
const OPERATION_LABELS = {
  catalog_search: "Product search",
  product_details: "Product details",
  catalog_lookup: "Catalog lookup",
  external_read: "External tool",
  web_read: "Web sources",
  structured_read: "Retrieving structured data",
  structured_schema: "Reading data fields",
  presentation: "Preparing response display",
  tool_workflow: "Retrieving related information",
} as const;

export function safePublicActivityParams(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (typeof input.operation !== "string" || !Object.hasOwn(OPERATION_LABELS, input.operation)) return undefined;
  const result: Record<string, string> = { operation: input.operation };
  if (typeof input.toolName === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(input.toolName)) result.toolName = input.toolName;
  if (typeof input.providerLabel === "string" && /^[\p{L}\p{N}][\p{L}\p{N} .&()-]{0,63}$/u.test(input.providerLabel)) result.providerLabel = input.providerLabel;
  return result;
}

export function publicToolActivityLabel(activity: ChatActivity, translate: (key: string) => string, settled = false): string | null {
  const params = safePublicActivityParams(activity.labelParams);
  if (!params) return null;
  const name = translate(OPERATION_LABELS[params.operation as keyof typeof OPERATION_LABELS]);
  if (activity.status === "failed") return `${name} · ${translate("Action failed")}`;
  if (settled && activity.status === "running") return `${name} · ${translate("Action interrupted")}`;
  if (activity.status === "completed") return `${name} · ${translate("Done.")}`;
  return `${name}…`;
}

export function publicToolActivityDetails(activity: ChatActivity): string | null {
  const params = safePublicActivityParams(activity.labelParams);
  if (!params) return null;
  // Technical tool identifiers remain parseable for older streams, but are
  // diagnostic metadata rather than visitor-facing explanations.
  return params.providerLabel || null;
}

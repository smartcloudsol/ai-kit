/** Explicit visitor consent is independent of model planning and navigation. */
export interface VisitorActionField {
  id: string;
  label: string;
  kind: "text" | "country-code";
  required: boolean;
  maxLength: number;
  /** Version 2 only: verified ISO country choices, never inferred from visitor locale. */
  countryCodes?: string[];
}
export interface VisitorActionSummary {
  label: string;
  value: string;
  /** Only explicitly server-authored messages are localization candidates. Source facts are not. */
  valueKind?: "source" | "message";
}
export interface VisitorActionProposal {
  schemaVersion: 1 | 2;
  handle: string;
  title: string;
  description: string;
  /** Version 2 only: secondary disclosure, separate from the compact description. */
  details?: string;
  submitLabel: string;
  summary: VisitorActionSummary[];
  fields: VisitorActionField[];
  expiresAt: number;
}
export interface ConfirmedVisitorAction {
  handle: string;
  confirmed: true;
  values: Record<string, string>;
}
export interface VisitorActionResult {
  schemaVersion: 1 | 2;
  handle: string;
  status: "completed" | "pending" | "failed";
  title: string;
  /** Version 2 only: purpose-specific server-authored status. */
  statusLabel?: string;
  summary: VisitorActionSummary[];
  /** Version 2 only: secondary source facts and server-authored disclosures. */
  details?: VisitorActionSummary[];
  /** Pending, known actions may offer a manual read-only retry of the same handle. */
  retryLabel?: string;
}

const HANDLE = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[a-z][a-zA-Z0-9_]{0,47}$/;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const object = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const prototype: unknown = Object.getPrototypeOf(v);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(v).every(key => {
    if (typeof key !== "string" || forbidden.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(v, key);
    return !!descriptor && descriptor.enumerable === true && Object.hasOwn(descriptor, "value");
  });
};
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype &&
  v.length <= max && Reflect.ownKeys(v).length === v.length + 1 &&
  Array.from({ length: v.length }, (_, index) => Object.getOwnPropertyDescriptor(v, String(index))).every(descriptor =>
    !!descriptor && descriptor.enumerable === true && Object.hasOwn(descriptor, "value"));
const text = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.length <= max &&
  !Array.from(v).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const summaries = (v: unknown, max = 40): v is VisitorActionSummary[] => list(v, max) &&
  v.every(row => object(row) && keys(row, ["label", "value", "valueKind"]) && text(row.label, 240) && text(row.value, 1000) &&
    (row.valueKind === undefined || row.valueKind === "source" || row.valueKind === "message"));

export function parseVisitorActionProposal(v: unknown): VisitorActionProposal | undefined {
  try {
  if (!object(v) || (v.schemaVersion !== 1 && v.schemaVersion !== 2) ||
      !keys(v, ["schemaVersion", "handle", "title", "description", "submitLabel", "summary", "fields", "expiresAt", ...(v.schemaVersion === 2 ? ["details"] : [])]) ||
      typeof v.handle !== "string" || !HANDLE.test(v.handle) || !text(v.title, 240) ||
      !text(v.description, 1000) || !text(v.submitLabel, 240) || !summaries(v.summary) ||
      (v.details !== undefined && !text(v.details, 1000)) ||
      !Number.isSafeInteger(v.expiresAt) || Number(v.expiresAt) < 1 || !list(v.fields, 8) ||
      !v.fields.every(field => object(field) && keys(field, ["id", "label", "kind", "required", "maxLength", ...(v.schemaVersion === 2 ? ["countryCodes"] : [])]) &&
        typeof field.id === "string" && ID.test(field.id) && !forbidden.has(field.id) && text(field.label, 240) &&
        typeof field.kind === "string" && ["text", "country-code"].includes(field.kind) && typeof field.required === "boolean" &&
        Number.isSafeInteger(field.maxLength) && Number(field.maxLength) >= 1 && Number(field.maxLength) <= 256 &&
        (field.countryCodes === undefined || (field.kind === "country-code" && list(field.countryCodes, 300) && field.countryCodes.length > 0 &&
          field.countryCodes.every(code => typeof code === "string" && /^[A-Z]{2}$/.test(code)) &&
          new Set(field.countryCodes).size === field.countryCodes.length))) ||
      new Set(v.fields.map(field => (field as Record<string, unknown>).id)).size !== v.fields.length) return undefined;
  return {
    schemaVersion: v.schemaVersion, handle: v.handle, title: v.title, description: v.description, submitLabel: v.submitLabel,
    ...(v.details !== undefined ? { details: v.details } : {}),
    summary: v.summary.map(row => ({ label: row.label, value: row.value, ...(row.valueKind !== undefined ? { valueKind: row.valueKind } : {}) })),
    fields: (v.fields as VisitorActionField[]).map(field => ({ id: field.id, label: field.label, kind: field.kind, required: field.required, maxLength: field.maxLength,
      ...(field.countryCodes !== undefined ? { countryCodes: [...field.countryCodes] } : {}) })),
    expiresAt: v.expiresAt as number,
  };
  } catch { return undefined; }
}

export function parseConfirmedVisitorAction(v: unknown): ConfirmedVisitorAction | undefined {
  try {
  if (!object(v) || !keys(v, ["handle", "confirmed", "values"]) || typeof v.handle !== "string" || !HANDLE.test(v.handle) ||
      v.confirmed !== true || !object(v.values) || Object.keys(v.values).length > 8 ||
      !Object.entries(v.values).every(([k, value]) => ID.test(k) && !forbidden.has(k) && typeof value === "string" && value.length <= 256 &&
        !Array.from(value).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) return undefined;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(v.values)) {
    if (typeof value !== "string") return undefined;
    values[key] = value;
  }
  return { handle: v.handle, confirmed: true, values };
  } catch { return undefined; }
}

export function parseVisitorActionResult(v: unknown): VisitorActionResult | undefined {
  try {
  if (!object(v) || (v.schemaVersion !== 1 && v.schemaVersion !== 2) ||
      !keys(v, ["schemaVersion", "handle", "status", "title", "summary", "retryLabel", ...(v.schemaVersion === 2 ? ["statusLabel", "details"] : [])]) ||
      typeof v.handle !== "string" || !HANDLE.test(v.handle) || typeof v.status !== "string" || !["completed", "pending", "failed"].includes(v.status) ||
      !text(v.title, 240) || !summaries(v.summary) ||
      (v.statusLabel !== undefined && !text(v.statusLabel, 240)) || (v.details !== undefined && !summaries(v.details, 20)) ||
      (v.retryLabel !== undefined && (v.status !== "pending" || !text(v.retryLabel, 240)))) return undefined;
  return { schemaVersion: v.schemaVersion, handle: v.handle, status: v.status as VisitorActionResult["status"], title: v.title,
    ...(v.statusLabel !== undefined ? { statusLabel: v.statusLabel } : {}),
    ...(v.details !== undefined ? { details: v.details.map(row => ({ label: row.label, value: row.value, ...(row.valueKind !== undefined ? { valueKind: row.valueKind } : {}) })) } : {}),
    summary: v.summary.map(row => ({ label: row.label, value: row.value, ...(row.valueKind !== undefined ? { valueKind: row.valueKind } : {}) })),
    ...(v.retryLabel !== undefined ? { retryLabel: v.retryLabel } : {}) };
  } catch { return undefined; }
}

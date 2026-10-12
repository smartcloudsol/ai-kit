/** Transport-free display contracts. Mapping never grants source access. */
export type AnswerLayout = "compact-list" | "cards" | "carousel" | "comparison";
export type AnswerPreset = "product-cards" | "comparison" | "recommendations" | "status-cards";
export type AnswerAttributeType = "string" | "number" | "boolean" | "string-list" | "money" | "status";
export type AnswerStatusSemantics = "orderability" | "inventory" | "booking" | "state";
export type AnswerStatusCode = "orderable" | "in-stock" | "backorder" | "available" | "unavailable" | "unknown" | "pending" | "complete" | "warning" | "error" | "info";
export interface AnswerMoney { amount: string; currency: string; unit: "major" | "minor"; scale?: number }
export interface AnswerStatus { code: AnswerStatusCode; label: string; semantics: AnswerStatusSemantics }
export type AnswerAttributeValue = string | number | boolean | string[] | AnswerMoney | AnswerStatus;
export interface AnswerAttributeMapping {
  id: string; label: string; pointer: string; type: AnswerAttributeType;
  role?: "price" | "availability" | "status" | "detail";
  money?: { currencyPointer: string; unit: "major" | "minor"; scale?: number; scalePointer?: string };
  status?: { semantics: AnswerStatusSemantics; values: { value: string | number | boolean; code: AnswerStatusCode; label: string }[]; unknownLabel?: string };
}
export type AnswerSource =
  | { kind: "structured_content"; postTypes: string[] }
  | { kind: "external_rest"; toolId: string }
  | { kind: "external_mcp"; serverId: string; toolName: string };
export interface AnswerTemplate {
  id: string;
  revision: number;
  layout: AnswerLayout;
  preset?: AnswerPreset;
  heading?: string;
  source: AnswerSource;
  itemsPointer: string;
  bindings: { id: string; title: string; description?: string };
  image?: { pointer: string; altPointer?: string; allowedUrlPrefixes: string[] };
  attributes: AnswerAttributeMapping[];
  links: { id: string; label: string; pointer: string; allowedUrlPrefixes: string[]; appearance?: "primary" | "secondary" }[];
  maxItems: number;
}
export interface AnswerPresentationPolicy {
  schemaVersion: 1 | 2;
  enabled: boolean;
  templates: AnswerTemplate[];
}
export interface AnswerEntity {
  ref: string;
  entityId: string;
  title: string;
  description?: string;
  image?: { url: string; alt: string };
  attributes: { id: string; label: string; type: AnswerAttributeType; value: AnswerAttributeValue; role?: AnswerAttributeMapping["role"] }[];
  links: { id: string; label: string; url: string; appearance?: "primary" | "secondary" }[];
  provenance: { kind: AnswerSource["kind"]; sourceId: string; evidenceId: string; checkedAt: string };
}
export interface AnswerPresentation {
  schemaVersion: 1 | 2;
  locale?: string;
  groups: { templateId: string; templateRevision: number; layout: AnswerLayout; preset?: AnswerPreset; heading?: string; entities: AnswerEntity[] }[];
}
export const ANSWER_PRESENTATION_MAX_BYTES = 12000;
export const ANSWER_PRESENTATION_MAX_GROUPS = 2;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function exact(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!record(v) || Object.keys(v).some((k) => !keys.includes(k))) throw new Error("Invalid answer presentation object");
}
const hasControls = (v: string, allowWhitespace = false): boolean => Array.from(v).some((c) => {
  const code = c.charCodeAt(0);
  return code < 32 && !(allowWhitespace && [9, 10, 13].includes(code));
});
function text(v: unknown, max: number, optional = false): string | undefined {
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string" || !v.trim() || v.length > max || hasControls(v, true)) throw new Error("Invalid answer presentation text");
  return v;
}
function identifier(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v) || forbidden.has(v)) throw new Error("Invalid answer presentation identifier");
}
function list(v: unknown, max: number): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Error("Invalid answer presentation list");
}
function uniqueIds(v: { id: string }[]): void {
  if (new Set(v.map((x) => x.id)).size !== v.length) throw new Error("Duplicate answer presentation identifier");
}
function integer(v: unknown, max: number): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < 1 || (v as number) > max) throw new Error("Invalid answer presentation limit");
}
function layout(v: unknown, version: number): asserts v is AnswerLayout {
  if (!(version === 2 ? ["compact-list", "cards", "carousel", "comparison"] : ["compact-list", "cards", "carousel"]).includes(v as string)) throw new Error("Invalid answer layout");
}
function attributeType(v: unknown, version: number): asserts v is AnswerAttributeType {
  if (!(version === 2 ? ["string", "number", "boolean", "string-list", "money", "status"] : ["string", "number", "boolean", "string-list"]).includes(v as string)) throw new Error("Invalid answer attribute type");
}
function preset(v: unknown): void {
  if (v !== undefined && !["product-cards", "comparison", "recommendations", "status-cards"].includes(v as string)) throw new Error("Invalid answer preset");
}
function role(v: unknown): void {
  if (v !== undefined && !["price", "availability", "status", "detail"].includes(v as string)) throw new Error("Invalid answer attribute role");
}
function appearance(v: unknown): void {
  if (v !== undefined && !["primary", "secondary"].includes(v as string)) throw new Error("Invalid answer link appearance");
}
function statusCode(code: unknown, semantics: unknown): void {
  const allowed: Record<AnswerStatusSemantics, string[]> = {
    orderability: ["orderable", "backorder", "unavailable", "unknown"],
    inventory: ["in-stock", "backorder", "unavailable", "unknown"],
    booking: ["available", "unavailable", "pending", "unknown"],
    state: ["pending", "complete", "warning", "error", "info", "unknown"],
  };
  if (typeof semantics !== "string" || !Object.hasOwn(allowed, semantics) || !allowed[semantics as AnswerStatusSemantics].includes(code as string)) throw new Error("Invalid answer status semantics");
}
function validMoney(v: unknown): v is AnswerMoney {
  try {
    exact(v, ["amount", "currency", "unit", "scale"]);
    if (typeof v.amount !== "string" || !/^-?(?:0|[1-9]\d{0,19})(?:\.\d{1,6})?$/.test(v.amount) ||
      typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency) || !["major", "minor"].includes(v.unit as string)) return false;
    const currencies = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("currency");
    if (currencies && !currencies.includes(v.currency)) return false;
    if (v.unit === "minor") return /^-?\d+$/.test(v.amount) && Number.isSafeInteger(v.scale) && (v.scale as number) >= 0 && (v.scale as number) <= 6;
    return v.scale === undefined;
  } catch { return false; }
}
function validStatus(v: unknown): v is AnswerStatus {
  try { exact(v, ["code", "label", "semantics"]); statusCode(v.code, v.semantics); text(v.label, 80); return true; } catch { return false; }
}

/** Preserve exact source units; only formatting is localized, never currency conversion. */
export function formatAnswerMoney(value: AnswerMoney, locale?: string): string | undefined {
  if (!validMoney(value)) return undefined;
  try {
    const negative = value.amount.startsWith("-");
    let digits = value.amount.replace(/^-/, "");
    if (value.unit === "minor") {
      const scale = value.scale!;
      digits = digits.padStart(scale + 1, "0");
      if (scale) digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    }
    const [whole, fraction = ""] = digits.split(".");
    const base = new Intl.NumberFormat(locale, { style: "currency", currency: value.currency });
    const precision = Math.max(base.resolvedOptions().minimumFractionDigits ?? 0, fraction.length);
    const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: value.currency, minimumFractionDigits: precision, maximumFractionDigits: precision });
    const integer = BigInt(whole!);
    const parts = formatter.formatToParts(negative ? (integer ? -integer : -0) : integer);
    const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false, numberingSystem: formatter.resolvedOptions().numberingSystem });
    const localizedFraction = [...fraction.padEnd(precision, "0")].map(d => digitFormatter.format(Number(d))).join("");
    return parts.map(part => part.type === "fraction" ? localizedFraction : part.value).join("");
  } catch { return undefined; }
}

/** Enumerate every input pointer, including secondary typed-value bindings. */
export function answerTemplatePointers(template: AnswerTemplate): string[] {
  return [template.bindings.id, template.bindings.title, template.bindings.description, template.image?.pointer, template.image?.altPointer,
    ...template.attributes.flatMap(a => [a.pointer, a.money?.currencyPointer, a.money?.scalePointer]), ...template.links.map(l => l.pointer)]
    .filter((p): p is string => p !== undefined);
}
function pointer(v: unknown): asserts v is string {
  if (typeof v !== "string" || v.length > 256 || (v !== "" && !v.startsWith("/")) || /~(?![01])/.test(v) || v.split("/").slice(1).some((k) => forbidden.has(k.replace(/~1/g, "/").replace(/~0/g, "~")))) throw new Error("Invalid display field pointer");
}
/** Only own properties: no expressions, coercion, wildcards or prototype traversal. */
export function readAnswerPointer(value: unknown, path: string): unknown {
  pointer(path);
  // REST responseFields deliberately retain literal pointer keys.
  if (record(value) && Object.hasOwn(value, path)) return value[path];
  if (!path) return value;
  let current = value;
  for (const segment of path.slice(1).split("/")) {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    if ((!record(current) && !Array.isArray(current)) || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
/** Public navigation/media only. This function does not fetch a URL. */
export function isAnswerHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/.test(value) || hasControls(value)) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") &&
      host.includes(".") && !host.endsWith(".") && !host.endsWith(".local") && !host.endsWith(".localhost") && !host.endsWith(".internal") &&
      !/^[\d.]+$/.test(host) && !host.includes(":") && host !== "localhost";
  } catch { return false; }
}
function prefixes(v: unknown): asserts v is string[] {
  list(v, 8);
  if (!v.length || v.some((x) => !isAnswerHttpsUrl(x) || new URL(x).search || new URL(x).hash)) throw new Error("Invalid display URL prefixes");
}
export function isAnswerUrlAllowed(value: unknown, allowed: string[]): value is string {
  if (!isAnswerHttpsUrl(value)) return false;
  const u = new URL(value);
  return allowed.some((p) => {
    if (!isAnswerHttpsUrl(p)) return false;
    const prefix = new URL(p);
    const path = prefix.pathname.replace(/\/$/, "");
    return !prefix.search && !prefix.hash && u.origin === prefix.origin && (!path || u.pathname === path || u.pathname.startsWith(`${path}/`));
  });
}
export function parseAnswerPresentationPolicy(value: unknown): AnswerPresentationPolicy {
  exact(value, ["schemaVersion", "enabled", "templates"]);
  if (![1, 2].includes(value.schemaVersion as number) || typeof value.enabled !== "boolean") throw new Error("Unsupported display policy");
  const version = value.schemaVersion as number;
  list(value.templates, 12);
  for (const t of value.templates) {
    exact(t, ["id", "revision", "layout", "heading", "source", "itemsPointer", "bindings", "image", "attributes", "links", "maxItems", ...(version === 2 ? ["preset"] : [])]);
    identifier(t.id); integer(t.revision, 1000000); layout(t.layout, version); preset(t.preset); text(t.heading, 160, true); pointer(t.itemsPointer); integer(t.maxItems, 6);
    if (!record(t.source)) throw new Error("Missing display source");
    if (t.source.kind === "structured_content") {
      exact(t.source, ["kind", "postTypes"]); list(t.source.postTypes, 32);
      if (!t.source.postTypes.length) throw new Error("Missing display post types");
      t.source.postTypes.forEach(identifier);
    } else if (t.source.kind === "external_rest") {
      exact(t.source, ["kind", "toolId"]); identifier(t.source.toolId);
    } else if (t.source.kind === "external_mcp") {
      exact(t.source, ["kind", "serverId", "toolName"]); identifier(t.source.serverId); identifier(t.source.toolName);
    } else throw new Error("Unsupported display source");
    exact(t.bindings, ["id", "title", "description"]); pointer(t.bindings.id); pointer(t.bindings.title);
    if (t.bindings.description !== undefined) pointer(t.bindings.description);
    if (t.image !== undefined) {
      exact(t.image, ["pointer", "altPointer", "allowedUrlPrefixes"]); pointer(t.image.pointer); prefixes(t.image.allowedUrlPrefixes);
      if (t.image.altPointer !== undefined) pointer(t.image.altPointer);
    }
    list(t.attributes, 8);
    for (const a of t.attributes) {
      exact(a, ["id", "label", "pointer", "type", ...(version === 2 ? ["role", "money", "status"] : [])]); identifier(a.id); text(a.label, 80); pointer(a.pointer); attributeType(a.type, version); role(a.role);
      if (a.type === "money") {
        exact(a.money, ["currencyPointer", "unit", "scale", "scalePointer"]); pointer(a.money.currencyPointer);
        if (!["major", "minor"].includes(a.money.unit as string) || a.status !== undefined) throw new Error("Invalid money mapping");
        if (a.money.unit === "minor") {
          if ((a.money.scale === undefined) === (a.money.scalePointer === undefined)) throw new Error("Declare exactly one source unit scale");
          if (a.money.scale !== undefined && (!Number.isSafeInteger(a.money.scale) || (a.money.scale as number) < 0 || (a.money.scale as number) > 6)) throw new Error("Invalid money scale");
          if (a.money.scalePointer !== undefined) pointer(a.money.scalePointer);
        } else if (a.money.scale !== undefined || a.money.scalePointer !== undefined) throw new Error("Major units do not have a minor unit scale");
      } else if (a.type === "status") {
        exact(a.status, ["semantics", "values", "unknownLabel"]); list(a.status.values, 16); text(a.status.unknownLabel, 80, true);
        if (a.money !== undefined || !a.status.values.length) throw new Error("Invalid status mapping");
        const values = new Set<string>();
        for (const row of a.status.values) {
          exact(row, ["value", "code", "label"]); statusCode(row.code, a.status.semantics); text(row.label, 80);
          if (!(typeof row.value === "string" && row.value.length <= 120) && typeof row.value !== "boolean" && !(typeof row.value === "number" && Number.isFinite(row.value))) throw new Error("Invalid status source value");
          const key = JSON.stringify(row.value); if (values.has(key)) throw new Error("Duplicate status source value"); values.add(key);
        }
      } else if (a.money !== undefined || a.status !== undefined) throw new Error("Unexpected typed value mapping");
    }
    uniqueIds(t.attributes as AnswerTemplate["attributes"]);
    list(t.links, 3);
    for (const l of t.links) {
      exact(l, ["id", "label", "pointer", "allowedUrlPrefixes", ...(version === 2 ? ["appearance"] : [])]); identifier(l.id); text(l.label, 80); pointer(l.pointer); prefixes(l.allowedUrlPrefixes); appearance(l.appearance);
    }
    uniqueIds(t.links as AnswerTemplate["links"]);
  }
  uniqueIds(value.templates as AnswerTemplate[]);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 24000) throw new Error("Display policy exceeds limit");
  return JSON.parse(JSON.stringify(value)) as AnswerPresentationPolicy;
}
function validAttribute(value: unknown, type: AnswerAttributeType): value is AnswerAttributeValue {
  if (type === "money") return validMoney(value);
  if (type === "status") return validStatus(value);
  if (type === "string") return typeof value === "string" && !!value.trim() && value.length <= 240;
  if (type === "number") return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (type === "boolean") return typeof value === "boolean";
  return Array.isArray(value) && value.length <= 12 && value.every((x) => typeof x === "string" && !!x.trim() && x.length <= 120);
}
/** Called on approved projected source values, never on model-authored facts. */
export function materializeAnswerEntity(template: AnswerTemplate, item: unknown, provenance: AnswerEntity["provenance"], ref: string): AnswerEntity | undefined {
  const id = readAnswerPointer(item, template.bindings.id);
  const title = readAnswerPointer(item, template.bindings.title);
  if ((typeof id !== "string" && typeof id !== "number") || (typeof id === "number" && !Number.isSafeInteger(id)) || !String(id).trim() || String(id).length > 256 || typeof title !== "string" || !title.trim() || title.length > 240) return undefined;
  const description = template.bindings.description === undefined ? undefined : readAnswerPointer(item, template.bindings.description);
  const imageUrl = template.image && readAnswerPointer(item, template.image.pointer);
  const alt = template.image?.altPointer === undefined ? undefined : readAnswerPointer(item, template.image.altPointer);
  const attributes = template.attributes.flatMap((a) => {
    const sourceValue = readAnswerPointer(item, a.pointer);
    let value: unknown = sourceValue;
    if (a.type === "money" && a.money) {
      if ((typeof sourceValue !== "string" && typeof sourceValue !== "number") || (typeof sourceValue === "number" && (!Number.isFinite(sourceValue) || Math.abs(sourceValue) > Number.MAX_SAFE_INTEGER))) return [];
      const scale = a.money.scalePointer === undefined ? a.money.scale : readAnswerPointer(item, a.money.scalePointer);
      value = { amount: String(sourceValue), currency: readAnswerPointer(item, a.money.currencyPointer), unit: a.money.unit, ...(a.money.unit === "minor" ? { scale } : {}) };
    } else if (a.type === "status" && a.status) {
      const mapped = a.status.values.find(row => Object.is(row.value, sourceValue));
      value = mapped ? { code: mapped.code, label: mapped.label, semantics: a.status.semantics }
        : a.status.unknownLabel ? { code: "unknown", label: a.status.unknownLabel, semantics: a.status.semantics } : undefined;
    }
    return validAttribute(value, a.type) ? [{ id: a.id, label: a.label, type: a.type, value, ...(a.role ? { role: a.role } : {}) }] : [];
  });
  const links = template.links.flatMap((l) => {
    const url = readAnswerPointer(item, l.pointer);
    return isAnswerUrlAllowed(url, l.allowedUrlPrefixes) ? [{ id: l.id, label: l.label, url, ...(l.appearance ? { appearance: l.appearance } : {}) }] : [];
  });
  return {
    ref, entityId: String(id), title,
    ...(typeof description === "string" && description.trim() ? { description: description.slice(0, 800) } : {}),
    ...(template.image && isAnswerUrlAllowed(imageUrl, template.image.allowedUrlPrefixes) ? { image: { url: imageUrl, alt: typeof alt === "string" && alt.length <= 240 ? alt : title } } : {}),
    attributes, links, provenance: { ...provenance },
  };
}
/** Fail closed on malformed/future envelopes; callers preserve the text answer. */
export function parseAnswerPresentation(value: unknown): AnswerPresentation | undefined {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > ANSWER_PRESENTATION_MAX_BYTES) return undefined;
    exact(value, ["schemaVersion", "groups", ...(record(value) && value.schemaVersion === 2 ? ["locale"] : [])]);
    if (![1, 2].includes(value.schemaVersion as number)) return undefined;
    const version = value.schemaVersion as number;
    if (value.locale !== undefined) { text(value.locale, 35); new Intl.NumberFormat(value.locale as string); }
    list(value.groups, ANSWER_PRESENTATION_MAX_GROUPS);
    const refs = new Set<string>();
    for (const g of value.groups) {
      exact(g, ["templateId", "templateRevision", "layout", "heading", "entities", ...(version === 2 ? ["preset"] : [])]);
      identifier(g.templateId); integer(g.templateRevision, 1000000); layout(g.layout, version); preset(g.preset); text(g.heading, 160, true); list(g.entities, 6);
      for (const e of g.entities) {
        exact(e, ["ref", "entityId", "title", "description", "image", "attributes", "links", "provenance"]);
        identifier(e.ref); text(e.entityId, 256); text(e.title, 240); text(e.description, 800, true);
        if (refs.has(e.ref)) return undefined;
        refs.add(e.ref);
        if (e.image !== undefined) {
          exact(e.image, ["url", "alt"]); if (!isAnswerHttpsUrl(e.image.url)) return undefined;
          // Empty alt is an explicit authored decorative choice.
          if (typeof e.image.alt !== "string" || e.image.alt.length > 240) return undefined;
        }
        list(e.attributes, 8);
        for (const a of e.attributes) {
          exact(a, ["id", "label", "type", "value", ...(version === 2 ? ["role"] : [])]); identifier(a.id); text(a.label, 80); attributeType(a.type, version); role(a.role);
          if (!validAttribute(a.value, a.type)) return undefined;
        }
        uniqueIds(e.attributes as AnswerEntity["attributes"]);
        list(e.links, 3);
        for (const l of e.links) {
          exact(l, ["id", "label", "url", ...(version === 2 ? ["appearance"] : [])]); identifier(l.id); text(l.label, 80); appearance(l.appearance); if (!isAnswerHttpsUrl(l.url)) return undefined;
        }
        uniqueIds(e.links as AnswerEntity["links"]);
        exact(e.provenance, ["kind", "sourceId", "evidenceId", "checkedAt"]);
        if (!["structured_content", "external_rest", "external_mcp"].includes(e.provenance.kind as string)) return undefined;
        identifier(e.provenance.evidenceId);
        text(e.provenance.sourceId, 256);
        if (typeof e.provenance.checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.provenance.checkedAt) || !Number.isFinite(Date.parse(e.provenance.checkedAt)) || new Date(e.provenance.checkedAt).toISOString() !== e.provenance.checkedAt) return undefined;
      }
    }
    return JSON.parse(JSON.stringify(value)) as AnswerPresentation;
  } catch { return undefined; }
}

/** Old clients receive only their negotiated schema; no new model invocation. */
export function answerPresentationForVersion(value: unknown, version: 1 | 2, locale?: string): AnswerPresentation | undefined {
  const parsed = parseAnswerPresentation(value);
  if (!parsed || parsed.schemaVersion === 1 || version === 2) return parsed;
  return parseAnswerPresentation({ schemaVersion: 1, groups: parsed.groups.map(group => ({
    templateId: group.templateId, templateRevision: group.templateRevision,
    layout: group.layout === "comparison" ? "cards" : group.layout,
    ...(group.heading ? { heading: group.heading } : {}),
    entities: group.entities.map(entity => ({ ...entity,
      attributes: entity.attributes.flatMap(attribute => {
        const value = attribute.type === "money" ? formatAnswerMoney(attribute.value as AnswerMoney, parsed.locale ?? locale)
          : attribute.type === "status" ? (attribute.value as AnswerStatus).label : attribute.value;
        return value === undefined ? [] : [{ id: attribute.id, label: attribute.label,
          type: ["money", "status"].includes(attribute.type) ? "string" : attribute.type, value }];
      }),
      links: entity.links.map(link => ({ id: link.id, label: link.label, url: link.url })),
    })),
  })) });
}

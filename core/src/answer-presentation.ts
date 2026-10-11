/** Transport-free display contracts. Mapping never grants source access. */
export type AnswerLayout = "compact-list" | "cards" | "carousel";
export type AnswerAttributeType = "string" | "number" | "boolean" | "string-list";
export type AnswerSource =
  | { kind: "structured_content"; postTypes: string[] }
  | { kind: "external_rest"; toolId: string }
  | { kind: "external_mcp"; serverId: string; toolName: string };
export interface AnswerTemplate {
  id: string;
  revision: number;
  layout: AnswerLayout;
  heading?: string;
  source: AnswerSource;
  itemsPointer: string;
  bindings: { id: string; title: string; description?: string };
  image?: { pointer: string; altPointer?: string; allowedUrlPrefixes: string[] };
  attributes: { id: string; label: string; pointer: string; type: AnswerAttributeType }[];
  links: { id: string; label: string; pointer: string; allowedUrlPrefixes: string[] }[];
  maxItems: number;
}
export interface AnswerPresentationPolicy {
  schemaVersion: 1;
  enabled: boolean;
  templates: AnswerTemplate[];
}
export interface AnswerEntity {
  ref: string;
  entityId: string;
  title: string;
  description?: string;
  image?: { url: string; alt: string };
  attributes: { id: string; label: string; type: AnswerAttributeType; value: string | number | boolean | string[] }[];
  links: { id: string; label: string; url: string }[];
  provenance: { kind: AnswerSource["kind"]; sourceId: string; evidenceId: string; checkedAt: string };
}
export interface AnswerPresentation {
  schemaVersion: 1;
  groups: { templateId: string; templateRevision: number; layout: AnswerLayout; heading?: string; entities: AnswerEntity[] }[];
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
function layout(v: unknown): asserts v is AnswerLayout {
  if (!["compact-list", "cards", "carousel"].includes(v as string)) throw new Error("Invalid answer layout");
}
function attributeType(v: unknown): asserts v is AnswerAttributeType {
  if (!["string", "number", "boolean", "string-list"].includes(v as string)) throw new Error("Invalid answer attribute type");
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
  if (value.schemaVersion !== 1 || typeof value.enabled !== "boolean") throw new Error("Unsupported display policy");
  list(value.templates, 12);
  for (const t of value.templates) {
    exact(t, ["id", "revision", "layout", "heading", "source", "itemsPointer", "bindings", "image", "attributes", "links", "maxItems"]);
    identifier(t.id); integer(t.revision, 1000000); layout(t.layout); text(t.heading, 160, true); pointer(t.itemsPointer); integer(t.maxItems, 6);
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
      exact(a, ["id", "label", "pointer", "type"]); identifier(a.id); text(a.label, 80); pointer(a.pointer); attributeType(a.type);
    }
    uniqueIds(t.attributes as AnswerTemplate["attributes"]);
    list(t.links, 3);
    for (const l of t.links) {
      exact(l, ["id", "label", "pointer", "allowedUrlPrefixes"]); identifier(l.id); text(l.label, 80); pointer(l.pointer); prefixes(l.allowedUrlPrefixes);
    }
    uniqueIds(t.links as AnswerTemplate["links"]);
  }
  uniqueIds(value.templates as AnswerTemplate[]);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 24000) throw new Error("Display policy exceeds limit");
  return JSON.parse(JSON.stringify(value)) as AnswerPresentationPolicy;
}
function validAttribute(value: unknown, type: AnswerAttributeType): value is string | number | boolean | string[] {
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
    const value = readAnswerPointer(item, a.pointer);
    return validAttribute(value, a.type) ? [{ id: a.id, label: a.label, type: a.type, value }] : [];
  });
  const links = template.links.flatMap((l) => {
    const url = readAnswerPointer(item, l.pointer);
    return isAnswerUrlAllowed(url, l.allowedUrlPrefixes) ? [{ id: l.id, label: l.label, url }] : [];
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
    exact(value, ["schemaVersion", "groups"]);
    if (value.schemaVersion !== 1) return undefined;
    list(value.groups, ANSWER_PRESENTATION_MAX_GROUPS);
    const refs = new Set<string>();
    for (const g of value.groups) {
      exact(g, ["templateId", "templateRevision", "layout", "heading", "entities"]);
      identifier(g.templateId); integer(g.templateRevision, 1000000); layout(g.layout); text(g.heading, 160, true); list(g.entities, 6);
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
          exact(a, ["id", "label", "type", "value"]); identifier(a.id); text(a.label, 80); attributeType(a.type);
          if (!validAttribute(a.value, a.type)) return undefined;
        }
        uniqueIds(e.attributes as AnswerEntity["attributes"]);
        list(e.links, 3);
        for (const l of e.links) {
          exact(l, ["id", "label", "url"]); identifier(l.id); text(l.label, 80); if (!isAnswerHttpsUrl(l.url)) return undefined;
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

/** Transport-free, opt-in own-field contracts. Identity and release data are not own fields. */
export const STRUCTURED_CONTENT_SCHEMA_VERSION = 1 as const;
export const STRUCTURED_CONTENT_LIMITS = { fields: 32, stringBytes: 4096, listItems: 64, payloadBytes: 8192, descriptionBytes: 512 } as const;
export type StructuredContentFieldType = "string" | "url" | "number" | "boolean" | "string-list";
export type StructuredContentValue = string | number | boolean | string[];
export interface StructuredContentFieldSchema { type: StructuredContentFieldType; description: string }
export interface StructuredContentFieldMapping extends StructuredContentFieldSchema { sourceMetaKey: string; targetKey: string }
export interface StructuredContentPolicy { enabled: boolean; fields: StructuredContentFieldMapping[] }
export interface StructuredContentProjection {
  schemaVersion: 1;
  enabled: boolean;
  fields: Record<string, StructuredContentValue>;
  fieldSchema: Record<string, StructuredContentFieldSchema>;
}
export class StructuredContentContractError extends Error {
  constructor(public readonly code: string, public readonly field: string, message: string) {
    super(message); this.name = "StructuredContentContractError";
  }
}
function reject(field: string, message: string): never {
  throw new StructuredContentContractError("invalid_structured_content", field, message);
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) reject(field, "Expected a plain object.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], field: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) reject(field, "Unknown structured content field.");
}
const encoder = new TextEncoder();
const reserved = /^(?:source_|site_|workspace_|release_|taxonomy_)/;
const protectedKeys = new Set(["identity", "entity_ref", "entity_type", "entity_post_id", "schema_version", "site_id", "workspace_id", "environment", "blog_id", "post_type", "post_id", "release_id", "release_version", "profile", "locale", "language", "title", "canonical_url", "url", "source_url", "source_id", "source_version", "category", "subcategory", "category_paths", "tags", "taxonomy_terms", "taxonomies", "metadata", "fields", "field_schema", "enabled", "constructor", "prototype", "__proto__"]);
export function isStructuredContentTargetKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(key) && !reserved.test(key) && !protectedKeys.has(key);
}
function description(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || encoder.encode(value).length > STRUCTURED_CONTENT_LIMITS.descriptionBytes) reject(field, "Description must be a non-empty bounded string.");
  return value;
}
function fieldType(value: unknown, field: string): StructuredContentFieldType {
  if (!["string", "url", "number", "boolean", "string-list"].includes(value as string)) reject(field, "Unsupported field type.");
  return value as StructuredContentFieldType;
}
function targetKey(key: string, field: string): void {
  if (!isStructuredContentTargetKey(key)) reject(field, "Invalid or reserved target key.");
}
export function parseStructuredContentPolicy(value: unknown): StructuredContentPolicy {
  const policy = object(value, "structuredContent");
  keys(policy, ["enabled", "fields"], "structuredContent");
  if (typeof policy.enabled !== "boolean") reject("structuredContent.enabled", "Expected boolean.");
  if (!Array.isArray(policy.fields) || policy.fields.length > STRUCTURED_CONTENT_LIMITS.fields) reject("structuredContent.fields", "Too many fields or invalid field list.");
  const targets = new Set<string>();
  const sources = new Set<string>();
  const fields = policy.fields.map((raw, index) => {
    const path = `structuredContent.fields[${index}]`;
    const field = object(raw, path);
    keys(field, ["sourceMetaKey", "targetKey", "type", "description"], path);
    if (typeof field.sourceMetaKey !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(field.sourceMetaKey) || ["__proto__", "prototype", "constructor"].includes(field.sourceMetaKey)) reject(`${path}.sourceMetaKey`, "Invalid source metadata key.");
    if (typeof field.targetKey !== "string") reject(`${path}.targetKey`, "Expected target key.");
    targetKey(field.targetKey, path);
    if (targets.has(field.targetKey) || sources.has(field.sourceMetaKey)) reject(path, "Duplicate field mapping.");
    targets.add(field.targetKey); sources.add(field.sourceMetaKey);
    return { sourceMetaKey: field.sourceMetaKey, targetKey: field.targetKey, type: fieldType(field.type, path), description: description(field.description, path) };
  }).sort((a, b) => a.targetKey < b.targetKey ? -1 : a.targetKey > b.targetKey ? 1 : 0);
  return { enabled: policy.enabled, fields };
}
function parseValue(value: unknown, type: StructuredContentFieldType, path: string): StructuredContentValue {
  const boundedString = (item: unknown): string => {
    if (typeof item !== "string" || encoder.encode(item).length > STRUCTURED_CONTENT_LIMITS.stringBytes) reject(path, "Expected bounded string.");
    return item;
  };
  if (type === "string-list") {
    if (!Array.isArray(value) || value.length > STRUCTURED_CONTENT_LIMITS.listItems) reject(path, "Expected bounded string list.");
    return value.map(boundedString);
  }
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) reject(path, "Expected bounded finite number without coercion.");
    return value;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") reject(path, "Expected boolean without coercion.");
    return value;
  }
  const text = boundedString(value);
  if (type === "url") {
    let url: URL;
    try { url = new URL(text); } catch { return reject(path, "Expected absolute HTTP(S) URL."); }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || [...text].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) reject(path, "Expected absolute HTTP(S) URL without credentials or control characters.");
  }
  return text;
}
export function parseStructuredContentProjection(value: unknown): StructuredContentProjection {
  const projection = object(value, "structuredContent");
  keys(projection, ["schemaVersion", "enabled", "fields", "fieldSchema"], "structuredContent");
  if (projection.schemaVersion !== 1 || typeof projection.enabled !== "boolean") reject("structuredContent", "Unsupported schema or invalid enabled flag.");
  const rawFields = object(projection.fields, "structuredContent.fields");
  const rawSchema = object(projection.fieldSchema, "structuredContent.fieldSchema");
  if (Object.keys(rawSchema).length > STRUCTURED_CONTENT_LIMITS.fields || (!projection.enabled && (Object.keys(rawFields).length || Object.keys(rawSchema).length))) reject("structuredContent", "Disabled projections must revoke every field and schema.");
  const fieldSchema: Record<string, StructuredContentFieldSchema> = {};
  const fields: Record<string, StructuredContentValue> = {};
  for (const key of Object.keys(rawSchema).sort()) {
    targetKey(key, `structuredContent.fieldSchema.${key}`);
    const schema = object(rawSchema[key], `structuredContent.fieldSchema.${key}`);
    keys(schema, ["type", "description"], key);
    fieldSchema[key] = { type: fieldType(schema.type, key), description: description(schema.description, key) };
  }
  for (const key of Object.keys(rawFields).sort()) {
    targetKey(key, `structuredContent.fields.${key}`);
    if (!Object.hasOwn(fieldSchema, key)) reject(key, "Field has no declared schema.");
    fields[key] = parseValue(rawFields[key], fieldSchema[key].type, key);
  }
  if (encoder.encode(JSON.stringify({ fields, fieldSchema })).length > STRUCTURED_CONTENT_LIMITS.payloadBytes) reject("structuredContent", "Structured fields and schema exceed the byte budget.");
  return { schemaVersion: 1, enabled: projection.enabled, fields, fieldSchema };
}

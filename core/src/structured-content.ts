/** Transport-free, opt-in own-field contracts. Identity and release data are not own fields. */
export const STRUCTURED_CONTENT_SCHEMA_VERSION = 1 as const;
export const STRUCTURED_CONTENT_DOCUMENT_SCHEMA_VERSION = 2 as const;
export const STRUCTURED_CONTENT_LIMITS = { fields: 32, stringBytes: 4096, listItems: 64, payloadBytes: 8192, descriptionBytes: 512, documentBytes: 65536, depth: 8, schemaNodes: 128, valueNodes: 2048 } as const;
export type StructuredContentScalarFieldType = "string" | "url" | "number" | "boolean" | "string-list";
export type StructuredContentFieldType = StructuredContentScalarFieldType | "object" | "array";
export type StructuredContentValue = string | number | boolean | StructuredContentValue[] | { [key: string]: StructuredContentValue };
export type StructuredContentFieldSchema =
  | { type: StructuredContentScalarFieldType; description: string }
  | { type: "object"; description: string; properties: Record<string, StructuredContentFieldSchema> }
  | { type: "array"; description: string; items: StructuredContentFieldSchema };
export type StructuredContentPostField = "featuredImageUrl" | "featuredImageAlt" | "excerpt";
export type StructuredContentFieldSource =
  | { sourceMetaKey: string; sourcePostField?: never }
  | { sourcePostField: StructuredContentPostField; sourceMetaKey?: never };
export type StructuredContentFieldMapping = StructuredContentFieldSchema & StructuredContentFieldSource & { targetKey: string };
export interface StructuredContentPolicy { enabled: boolean; fields: StructuredContentFieldMapping[] }
export interface StructuredContentProjection {
  schemaVersion: 1 | 2;
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
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(entry => !Object.hasOwn(entry, "value") || !entry.enumerable)) reject(field, "Expected a plain data object.");
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
  if (!["string", "url", "number", "boolean", "string-list", "object", "array"].includes(value as string)) reject(field, "Unsupported field type.");
  return value as StructuredContentFieldType;
}
function targetKey(key: string, field: string): void {
  if (!isStructuredContentTargetKey(key)) reject(field, "Invalid or reserved target key.");
}
type ParseBudget = { schemaNodes: number; valueNodes: number; nested: boolean };
function nestedKey(key: string, path: string): void {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || ["constructor", "prototype", "__proto__"].includes(key)) reject(path, "Invalid nested property name.");
}
function boundedArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > STRUCTURED_CONTENT_LIMITS.listItems ||
      Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.keys(value).length !== value.length ||
      Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index))).some(entry => !entry || !Object.hasOwn(entry, "value"))) reject(path, "Expected a bounded dense data array.");
  return value;
}
function parseSchema(value: unknown, path: string, budget: ParseBudget, depth = 1): StructuredContentFieldSchema {
  if (++budget.schemaNodes > STRUCTURED_CONTENT_LIMITS.schemaNodes || depth > STRUCTURED_CONTENT_LIMITS.depth) reject(path, "Schema exceeds structural bounds.");
  const schema = object(value, path);
  const type = fieldType(schema.type, path);
  const text = description(schema.description, path);
  if (type === "object") {
    if (!budget.nested) reject(path, "Nested fields require document schema version 2.");
    keys(schema, ["type", "description", "properties"], path);
    const raw = object(schema.properties, path);
    if (Object.keys(raw).length > STRUCTURED_CONTENT_LIMITS.fields) reject(path, "Too many object properties.");
    const properties: Record<string, StructuredContentFieldSchema> = {};
    for (const key of Object.keys(raw).sort()) {
      nestedKey(key, path);
      properties[key] = parseSchema(raw[key], `${path}.${key}`, budget, depth + 1);
    }
    return { type, description: text, properties };
  }
  if (type === "array") {
    if (!budget.nested) reject(path, "Nested fields require document schema version 2.");
    keys(schema, ["type", "description", "items"], path);
    return { type, description: text, items: parseSchema(schema.items, `${path}[]`, budget, depth + 1) };
  }
  keys(schema, ["type", "description"], path);
  return { type, description: text };
}
/** Schema-only helper for editors; never reads or authorizes source values. */
export function parseStructuredContentFieldSchema(value: unknown): StructuredContentFieldSchema {
  return parseSchema(value, "fieldSchema", { schemaNodes: 0, valueNodes: 0, nested: true });
}
export function parseStructuredContentPolicy(value: unknown): StructuredContentPolicy {
  const policy = object(value, "structuredContent");
  keys(policy, ["enabled", "fields"], "structuredContent");
  if (typeof policy.enabled !== "boolean") reject("structuredContent.enabled", "Expected boolean.");
  const rawFields = boundedArray(policy.fields, "structuredContent.fields");
  if (rawFields.length > STRUCTURED_CONTENT_LIMITS.fields) reject("structuredContent.fields", "Too many fields.");
  const targets = new Set<string>();
  const sources = new Set<string>();
  const budget: ParseBudget = { schemaNodes: 0, valueNodes: 0, nested: true };
  const fields: StructuredContentFieldMapping[] = rawFields.map((raw, index) => {
    const path = `structuredContent.fields[${index}]`;
    const field = object(raw, path);
    keys(field, ["sourceMetaKey", "sourcePostField", "targetKey", "type", "description", "properties", "items"], path);
    const native = Object.hasOwn(field, "sourcePostField");
    if (native === Object.hasOwn(field, "sourceMetaKey")) reject(path, "Select exactly one field source.");
    const type = fieldType(field.type, path);
    let source: StructuredContentFieldSource;
    let sourceIdentity: string;
    if (native) {
      if (!["featuredImageUrl", "featuredImageAlt", "excerpt"].includes(field.sourcePostField as string)) reject(`${path}.sourcePostField`, "Unsupported native post field.");
      const sourcePostField = field.sourcePostField as StructuredContentPostField;
      if (type !== (sourcePostField === "featuredImageUrl" ? "url" : "string")) reject(`${path}.type`, "Native field type cannot be changed.");
      source = { sourcePostField };
      sourceIdentity = `post:${sourcePostField}`;
    } else {
      if (typeof field.sourceMetaKey !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(field.sourceMetaKey) || ["__proto__", "prototype", "constructor"].includes(field.sourceMetaKey)) reject(`${path}.sourceMetaKey`, "Invalid source metadata key.");
      source = { sourceMetaKey: field.sourceMetaKey };
      sourceIdentity = `meta:${field.sourceMetaKey}`;
    }
    if (typeof field.targetKey !== "string") reject(`${path}.targetKey`, "Expected target key.");
    targetKey(field.targetKey, path);
    if (targets.has(field.targetKey) || sources.has(sourceIdentity)) reject(path, "Duplicate field mapping.");
    targets.add(field.targetKey); sources.add(sourceIdentity);
    const schema = parseSchema(Object.fromEntries(Object.entries(field).filter(([key]) => ["type", "description", "properties", "items"].includes(key))), path, budget);
    return { ...source, targetKey: field.targetKey, ...schema } as StructuredContentFieldMapping;
  }).sort((a, b) => a.targetKey < b.targetKey ? -1 : a.targetKey > b.targetKey ? 1 : 0);
  return { enabled: policy.enabled, fields };
}
function parseValue(value: unknown, schema: StructuredContentFieldSchema, path: string, budget: ParseBudget, depth = 1): StructuredContentValue {
  if ((++budget.valueNodes > STRUCTURED_CONTENT_LIMITS.valueNodes && budget.nested) || depth > STRUCTURED_CONTENT_LIMITS.depth) reject(path, "Value exceeds structural bounds.");
  const type = schema.type;
  if (schema.type === "object") {
    const raw = object(value, path);
    const result: Record<string, StructuredContentValue> = {};
    for (const key of Object.keys(raw).sort()) {
      if (!Object.hasOwn(schema.properties, key)) reject(path, "Undeclared nested property.");
      result[key] = parseValue(raw[key], schema.properties[key], `${path}.${key}`, budget, depth + 1);
    }
    return result;
  }
  if (schema.type === "array") return boundedArray(value, path).map(item => parseValue(item, schema.items, `${path}[]`, budget, depth + 1));
  const boundedString = (item: unknown): string => {
    if (typeof item !== "string" || encoder.encode(item).length > STRUCTURED_CONTENT_LIMITS.stringBytes) reject(path, "Expected bounded string.");
    return item;
  };
  if (type === "string-list") {
    return boundedArray(value, path).map(item => parseValue(item, { type: "string", description: schema.description }, `${path}[]`, budget, depth + 1)) as string[];
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
  if (![1, 2].includes(projection.schemaVersion as number) || typeof projection.enabled !== "boolean") reject("structuredContent", "Unsupported schema or invalid enabled flag.");
  const rawFields = object(projection.fields, "structuredContent.fields");
  const rawSchema = object(projection.fieldSchema, "structuredContent.fieldSchema");
  if (Object.keys(rawSchema).length > STRUCTURED_CONTENT_LIMITS.fields || (!projection.enabled && (Object.keys(rawFields).length || Object.keys(rawSchema).length))) reject("structuredContent", "Disabled projections must revoke every field and schema.");
  const fieldSchema: Record<string, StructuredContentFieldSchema> = {};
  const fields: Record<string, StructuredContentValue> = {};
  const budget: ParseBudget = { schemaNodes: 0, valueNodes: 0, nested: projection.schemaVersion === 2 };
  for (const key of Object.keys(rawSchema).sort()) {
    targetKey(key, `structuredContent.fieldSchema.${key}`);
    fieldSchema[key] = parseSchema(rawSchema[key], `structuredContent.fieldSchema.${key}`, budget);
  }
  for (const key of Object.keys(rawFields).sort()) {
    targetKey(key, `structuredContent.fields.${key}`);
    if (!Object.hasOwn(fieldSchema, key)) reject(key, "Field has no declared schema.");
    fields[key] = parseValue(rawFields[key], fieldSchema[key], key, budget);
  }
  const maximum = projection.schemaVersion === 1 ? STRUCTURED_CONTENT_LIMITS.payloadBytes : STRUCTURED_CONTENT_LIMITS.documentBytes;
  if (encoder.encode(JSON.stringify({ fields, fieldSchema })).length > maximum) reject("structuredContent", "Structured fields and schema exceed the byte budget.");
  return { schemaVersion: projection.schemaVersion as 1 | 2, enabled: projection.enabled, fields, fieldSchema };
}

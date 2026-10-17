/** Safe catalog navigation metadata. Provider cursors and queries remain server-owned. */
export interface CatalogPage {
  schemaVersion: 1;
  pageIndex: number;
  pageSize: number;
  returnedCount: number;
  displayedCount?: number;
  totalCount?: number;
  hasMore: boolean;
  nextHandle?: string;
  previousHandle?: string;
  expiresAt: number;
}
export const CATALOG_PAGE_HANDLE = /^[A-Za-z0-9_-]{43}$/;
export function parseCatalogPage(value: unknown): CatalogPage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !["schemaVersion", "pageIndex", "pageSize", "returnedCount", "displayedCount", "totalCount", "hasMore", "nextHandle", "previousHandle", "expiresAt"].includes(k))) return undefined;
  const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
  if (p.schemaVersion !== 1 || !integer(p.pageIndex, 0, 99) || !integer(p.pageSize, 1, 6) ||
      !integer(p.returnedCount, 0, p.pageSize) || typeof p.hasMore !== "boolean" ||
      !integer(p.expiresAt, 1, Number.MAX_SAFE_INTEGER)) return undefined;
  if (p.displayedCount !== undefined && !integer(p.displayedCount, 0, p.returnedCount)) return undefined;
  if (p.totalCount !== undefined && !integer(p.totalCount, p.returnedCount, Number.MAX_SAFE_INTEGER)) return undefined;
  for (const key of ["nextHandle", "previousHandle"]) if (p[key] !== undefined && (typeof p[key] !== "string" || !CATALOG_PAGE_HANDLE.test(p[key]))) return undefined;
  if ((!p.hasMore && p.nextHandle !== undefined) || (p.pageIndex === 0 && p.previousHandle !== undefined)) return undefined;
  return { ...p } as unknown as CatalogPage;
}

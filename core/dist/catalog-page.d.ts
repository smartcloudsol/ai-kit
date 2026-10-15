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
export declare const CATALOG_PAGE_HANDLE: RegExp;
export declare function parseCatalogPage(value: unknown): CatalogPage | undefined;

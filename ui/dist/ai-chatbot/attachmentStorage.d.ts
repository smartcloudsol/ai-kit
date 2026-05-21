export type StoredAttachment = {
    id: string;
    name: string;
    type: string;
    size: number;
    blob: Blob;
    createdAt: number;
};
export declare function persistAttachmentBlob(id: string, blob: Blob, meta: {
    name: string;
    type: string;
    size: number;
}): Promise<string | null>;
export declare function loadAttachmentBlob(id: string): Promise<StoredAttachment | null>;
export declare function deleteAttachmentBlob(id: string): Promise<void>;
export declare function clearAllAttachments(): Promise<void>;
export declare function cleanupDanglingAttachments(validIds: Set<string>): Promise<void>;
export declare function getAllAttachments(): Promise<StoredAttachment[]>;
export declare function enforceStorageQuota(): Promise<void>;

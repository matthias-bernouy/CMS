import type { FileReference, NamespaceRecord } from "cms-files/interfaces";

/** Runtime-managed workspace; credentials stay behind this port. */
export interface CmsFileWorkspace {
    get(input: { offset?: number; limit?: number }): Promise<{
        namespace: NamespaceRecord;
        items: readonly FileReference[];
        offset: number;
        limit: number;
    }>;
    createUpload(input: {
        filename: string;
        size: number;
        contentType?: string;
        visibility?: "private" | "public";
        imageProfile?: "thumbnail" | "responsive";
        fileId?: string;
    }): Promise<{ uploadId: string; uploadToken: string; expiresAt: string; maxBytes: number }>;
    completeUpload(uploadId: string): Promise<FileReference>;
    updateFile(fileId: string, name: string): Promise<FileReference>;
    setFileVisibility(fileId: string, visibility: "private" | "public"): Promise<FileReference>;
    signFile(fileId: string, generation: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: string }>;
    deleteFile(fileId: string): Promise<void>;
}

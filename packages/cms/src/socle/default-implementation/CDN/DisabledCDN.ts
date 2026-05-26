import type {
    CDN, BucketLimits, BucketQuotas,
    CDNGetItemsOptions, CDNItemsPage, CDNItem,
    CDNUploadFileOptions, FileMetadata,
    CDNCreateFolderOptions, FolderMetadata,
    CDNUpdateItemOptions, CDNDeleteItemOptions,
    CDNResponse,
} from "@bernouy/core";

const UNSUPPORTED = <T>(): CDNResponse<T> => ({
    ok: false,
    error: {
        code: "unsupported_operation",
        message: "Media operations are unavailable — no storage bucket is configured for this CMS.",
    },
});

/**
 * No-op CDN for a Control instance mounted **without a storage bucket**.
 * Every operation returns `unsupported_operation`; `origins` is empty so the
 * admin CSP whitelists nothing extra. The Media admin surfaces the error
 * inline and image pickers fail loud — acceptable until a real bucket is
 * configured (then the tenant is re-mounted with a live `CDN`).
 *
 * Also used by `p9r dev`, which has no storage backend.
 */
export class DisabledCDN implements CDN {
    readonly limits: BucketLimits = { maxFileSize: 0, acceptedMimeTypes: "*" };
    readonly quotas: BucketQuotas = { maxTotalSize: 0, maxFileCount: 0 };
    readonly cacheControl = "no-store";
    readonly origins: string[] = [];

    async getItems(_opts?: CDNGetItemsOptions): Promise<CDNResponse<CDNItemsPage>> { return UNSUPPORTED(); }
    async getItem(_id: string):                Promise<CDNResponse<CDNItem>>      { return UNSUPPORTED(); }
    async uploadFile(_opts: CDNUploadFileOptions):     Promise<CDNResponse<FileMetadata>>   { return UNSUPPORTED(); }
    async createFolder(_opts: CDNCreateFolderOptions): Promise<CDNResponse<FolderMetadata>> { return UNSUPPORTED(); }
    async updateItem(_opts: CDNUpdateItemOptions):     Promise<CDNResponse<CDNItem>>        { return UNSUPPORTED(); }
    async deleteItem(_opts: CDNDeleteItemOptions):     Promise<CDNResponse<{ id: string }>> { return UNSUPPORTED(); }
}

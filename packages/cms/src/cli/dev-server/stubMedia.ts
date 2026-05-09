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
    error: { code: "unsupported_operation", message: "Media operations are disabled in `p9r dev`." },
});

/**
 * No-op CDN for `p9r dev`. Every operation returns `unsupported_operation`
 * — the dev server has no storage backend. Browsing the Media admin will
 * surface the error inline, image pickers will fail loud. Acceptable
 * trade-off: media is out of scope for the local-only dev workflow.
 *
 * Drop this in favour of a real `LocalFsMedia` if/when dev needs to upload.
 */
export class StubMedia implements CDN {
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

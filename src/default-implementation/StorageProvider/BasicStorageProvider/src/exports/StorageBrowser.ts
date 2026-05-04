import type {
    CDN, CDNCreateFolderOptions, CDNDeleteItemOptions, CDNGetItemsOptions,
    CDNItem, CDNItemsPage, CDNResponse, CDNUpdateItemOptions, CDNUploadFileOptions,
    FileMetadata, FolderMetadata, BucketLimits, BucketQuotas,
} from "../../../../../interfaces/CDN";

export type StorageBrowserHydration = {
    /** Base URL of the broker's frontier A (e.g. `"/_storage"` or
     *  `"https://app.tld/_storage"`). No trailing slash. */
    apiBaseUrl: string;
    /** Bucket info exposed read-only on the CDN instance. */
    bucket: { limits: BucketLimits; quotas: BucketQuotas; cacheControl: string };
};

/**
 * Browser-deployable `CDN` implementation. Talks to the broker's frontier A
 * over HTTP; never sees the bucket-credential cleartext token. Designed to be
 * serialized via `constructor.toString()` and rehydrated client-side, hence:
 * - all helpers are private methods (no module-level functions),
 * - only `import type` (erased at compile time) — zero runtime imports,
 * - only Web-standard globals (`fetch`, `URL`, `URLSearchParams`, `Blob`, …).
 */
export class StorageBrowser implements CDN {

    public readonly limits:       BucketLimits;
    public readonly quotas:       BucketQuotas;
    public readonly cacheControl: string;

    private _apiBaseUrl: string;

    constructor(h: StorageBrowserHydration) {
        this.limits       = h.bucket.limits;
        this.quotas       = h.bucket.quotas;
        this.cacheControl = h.bucket.cacheControl;
        this._apiBaseUrl  = h.apiBaseUrl.replace(/\/+$/, "");
    }

    async getItems(opts: CDNGetItemsOptions = {}): Promise<CDNResponse<CDNItemsPage>> {
        return this._call<CDNItemsPage>("GET", "/items/list?" + this._serializeListOpts(opts));
    }

    async getItem(id: string): Promise<CDNResponse<CDNItem>> {
        return this._call<CDNItem>("GET", "/items?id=" + encodeURIComponent(id));
    }

    async createFolder(opts: CDNCreateFolderOptions): Promise<CDNResponse<FolderMetadata>> {
        return this._call<FolderMetadata>("POST", "/folders", opts);
    }

    async updateItem(opts: CDNUpdateItemOptions): Promise<CDNResponse<CDNItem>> {
        const { id, ...body } = opts;
        return this._call<CDNItem>("PATCH", "/items?id=" + encodeURIComponent(id), body);
    }

    async deleteItem(opts: CDNDeleteItemOptions): Promise<CDNResponse<{ id: string }>> {
        const qs = "id=" + encodeURIComponent(opts.id) + (opts.recursive ? "&recursive=true" : "");
        return this._call<{ id: string }>("DELETE", "/items?" + qs);
    }

    async uploadFile(opts: CDNUploadFileOptions): Promise<CDNResponse<FileMetadata>> {
        let size: number;
        let contentType: string = opts.mimeType || "application/octet-stream";
        if (opts.data instanceof Uint8Array) {
            size = opts.data.byteLength;
        } else if (typeof Blob !== "undefined" && opts.data instanceof Blob) {
            size = opts.data.size;
            if (!opts.mimeType && opts.data.type) contentType = opts.data.type;
        } else {
            if (opts.size === undefined) {
                return { ok: false, error: { code: "validation_error", message: "size is required when data is a ReadableStream." } };
            }
            size = opts.size;
        }

        const mint = await this._call<{ id: string; uploadURL: string; expiresAt: string }>("POST", "/upload-tokens", {
            name:           opts.name,
            maxSize:        size,
            parentFolderID: opts.folderID ?? null,
            contentType,
            publicPath:     opts.publicPath,
        });
        if (!mint.ok) return mint;

        try {
            const init: RequestInit = { method: "POST", headers: { "Content-Type": contentType } };
            if (opts.signal) init.signal = opts.signal;
            init.body = opts.data instanceof Uint8Array
                ? new Blob([opts.data as BlobPart])
                : (opts.data as Blob | ReadableStream<Uint8Array>);
            const res = await fetch(mint.data.uploadURL, init);
            return await res.json() as CDNResponse<FileMetadata>;
        } catch (err) {
            return { ok: false, error: { code: "storage_unavailable", message: err instanceof Error ? err.message : String(err) } };
        }
    }

    private async _call<T>(method: string, path: string, body?: unknown): Promise<CDNResponse<T>> {
        try {
            const init: RequestInit = { method, headers: {} };
            if (body !== undefined) {
                (init.headers as Record<string, string>)["Content-Type"] = "application/json";
                init.body = JSON.stringify(body);
            }
            const res = await fetch(this._apiBaseUrl + path, init);
            return await res.json() as CDNResponse<T>;
        } catch (err) {
            return { ok: false, error: { code: "storage_unavailable", message: err instanceof Error ? err.message : String(err) } };
        }
    }

    private _serializeListOpts(opts: CDNGetItemsOptions): string {
        const p = new URLSearchParams();
        if (opts.folderID)   p.set("folderID",  opts.folderID);
        if (opts.accept)     p.set("accept",    opts.accept.join(","));
        if (opts.search)     p.set("search",    opts.search);
        if (opts.sortBy)     p.set("sortBy",    opts.sortBy);
        if (opts.sortOrder)  p.set("sortOrder", opts.sortOrder);
        if (opts.recursive)  p.set("recursive", "true");
        if (opts.pagination) {
            p.set("page",  String(opts.pagination.page));
            p.set("limit", String(opts.pagination.limit));
        }
        return p.toString();
    }
}

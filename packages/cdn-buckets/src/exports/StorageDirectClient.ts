import type {
    CDN, CDNCreateFolderOptions, CDNDeleteItemOptions, CDNGetItemsOptions,
    CDNItem, CDNItemsPage, CDNResponse, CDNUpdateItemOptions, CDNUploadFileOptions,
    FileMetadata, FolderMetadata, BucketLimits, BucketQuotas,
} from "@bernouy/core";

export type StorageDirectClientConfig = {
    /** Origin of the StorageProvider, e.g. `https://cdn.example.com`. */
    providerOrigin: string;
    /** Bucket-credential cleartext bearer — held server-side. */
    credentialToken: string;
};

/**
 * Server-side `CDN` consumer that talks directly to the StorageProvider's
 * frontier B endpoints (`/api/*`) with the bucket credential injected as
 * `Authorization: Bearer`. Counterpart to `StorageBrowser`, which goes
 * through a broker — `StorageDirectClient` is for processes that hold the
 * credential themselves (e.g. the Delivery cron) and don't need the
 * broker indirection.
 *
 * NOT browser-deployable — never serialize an instance of this class to
 * the client; that would leak the credential.
 */
export class StorageDirectClient implements CDN {

    public readonly limits:       BucketLimits;
    public readonly quotas:       BucketQuotas;
    public readonly cacheControl: string;

    private _providerOrigin: string;
    private _bearer:         string;

    constructor(
        config: StorageDirectClientConfig,
        bucket: { limits: BucketLimits; quotas: BucketQuotas; cacheControl: string },
    ) {
        this._providerOrigin = config.providerOrigin.replace(/\/+$/, "");
        this._bearer         = config.credentialToken;
        this.limits          = bucket.limits;
        this.quotas          = bucket.quotas;
        this.cacheControl    = bucket.cacheControl;
    }

    /** Fetches the bucket metadata before constructing — convenience wrapper. */
    static async fromCredential(config: StorageDirectClientConfig): Promise<StorageDirectClient> {
        const res = await fetch(`${config.providerOrigin.replace(/\/+$/, "")}/api/bucket`, {
            headers: { "Authorization": `Bearer ${config.credentialToken}` },
        });
        const json = await res.json() as { ok: true; data: { limits: BucketLimits; quotas: BucketQuotas; cacheControl: string } } | { ok: false; error: { message: string } };
        if (!json.ok) throw new Error(`StorageDirectClient init: ${json.error.message}`);
        return new StorageDirectClient(config, json.data);
    }

    async getItems(opts: CDNGetItemsOptions = {}): Promise<CDNResponse<CDNItemsPage>> {
        return this._call<CDNItemsPage>("GET", `/api/items/list?${this._serializeListOpts(opts)}`);
    }
    async getItem(id: string): Promise<CDNResponse<CDNItem>> {
        return this._call<CDNItem>("GET", `/api/items?id=${encodeURIComponent(id)}`);
    }
    async createFolder(opts: CDNCreateFolderOptions): Promise<CDNResponse<FolderMetadata>> {
        return this._call<FolderMetadata>("POST", "/api/folders", opts);
    }
    async updateItem(opts: CDNUpdateItemOptions): Promise<CDNResponse<CDNItem>> {
        const { id, ...body } = opts;
        return this._call<CDNItem>("PATCH", `/api/items?id=${encodeURIComponent(id)}`, body);
    }
    async deleteItem(opts: CDNDeleteItemOptions): Promise<CDNResponse<{ id: string }>> {
        const qs = `id=${encodeURIComponent(opts.id)}${opts.recursive ? "&recursive=true" : ""}`;
        return this._call<{ id: string }>("DELETE", `/api/items?${qs}`);
    }

    /**
     * Self-service update of the holding bucket. Server-side filters which
     * fields are honored — currently only `notFoundPath`. The bucket is
     * identified by the credential bearer; no `id` parameter.
     */
    async updateBucketSettings(patch: { notFoundPath?: string | null }): Promise<CDNResponse<unknown>> {
        return this._call<unknown>("PATCH", "/api/bucket", patch);
    }

    async uploadFile(opts: CDNUploadFileOptions): Promise<CDNResponse<FileMetadata>> {
        const { name, data, folderID, publicPath, overwrite, signal } = opts;
        const mimeType = opts.mimeType
            ?? (typeof Blob !== "undefined" && data instanceof Blob && data.type ? data.type : "application/octet-stream");
        const size = await sizeOf(data, opts.size);

        // Server-to-server: mint a token via frontier B, then POST to /upload.
        const mint = await this._call<{ id: string; uploadURL: string; expiresAt: string }>(
            "POST", "/api/upload-tokens",
            {
                name,
                maxSize:        size,
                parentFolderID: folderID ?? null,
                contentType:    mimeType,
                publicPath,
                overwrite,
            },
        );
        if (!mint.ok) return mint;

        try {
            const init: RequestInit = {
                method:  "POST",
                headers: { "Content-Type": mimeType, "Content-Length": String(size) },
                body:    data instanceof Uint8Array ? new Blob([data as BlobPart]) : (data as Blob | ReadableStream<Uint8Array>),
            };
            if (signal) init.signal = signal;
            const res = await fetch(mint.data.uploadURL, init);
            return await res.json() as CDNResponse<FileMetadata>;
        } catch (err) {
            return { ok: false, error: { code: "storage_unavailable", message: err instanceof Error ? err.message : String(err) } };
        }
    }

    private async _call<T>(method: string, path: string, body?: unknown): Promise<CDNResponse<T>> {
        try {
            const init: RequestInit = { method, headers: { "Authorization": `Bearer ${this._bearer}` } };
            if (body !== undefined) {
                (init.headers as Record<string, string>)["Content-Type"] = "application/json";
                init.body = JSON.stringify(body);
            }
            const res = await fetch(this._providerOrigin + path, init);
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

async function sizeOf(data: CDNUploadFileOptions["data"], hinted: number | undefined): Promise<number> {
    if (data instanceof Uint8Array) return data.byteLength;
    if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
    if (hinted === undefined) throw new Error("size hint required for ReadableStream uploads.");
    return hinted;
}

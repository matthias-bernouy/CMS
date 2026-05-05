import type { CDN, CDNGetItemsOptions, CDNUploadFileOptions, CDNCreateFolderOptions, CDNUpdateItemOptions, CDNDeleteItemOptions, CDNItem, CDNResponse, CDNItemsPage, FileMetadata, FolderMetadata } from "@bernouy/core";
/**
 * In-memory `CDN` implementation for tests and local development. Honours
 * the public contract (limits / quotas / cacheControl, conflict semantics
 * on `overwrite: false`, `publicPath` uniqueness, paginated listing,
 * `search` substring match) while keeping every byte in process.
 *
 * Folders, `updateItem` and a couple of advanced niceties are out of
 * scope — the builder doesn't use them. The companion `fetchBytes(url)`
 * + `makeCdnFetcher(buckets)` helper lets tests resolve `absoluteURL`s
 * back to the stored bytes without a real HTTP server.
 */
export class InMemoryCDN implements CDN {
    private _files         = new Map<string, FileMetadata>();
    private _bytes         = new Map<string, Uint8Array>();
    private _byName        = new Map<string, string>();
    private _byPublicPath  = new Map<string, string>();
    private _nextId        = 1;
    private _urlPrefix:    string;

    readonly limits        = { maxFileSize: 1_000_000_000, acceptedMimeTypes: "*" as const };
    readonly quotas        = { maxTotalSize: Number.MAX_SAFE_INTEGER, maxFileCount: Number.MAX_SAFE_INTEGER };
    readonly cacheControl: string;

    constructor(opts: { urlPrefix?: string; cacheControl?: string } = {}) {
        this._urlPrefix   = opts.urlPrefix   ?? `https://cdn-${Math.random().toString(36).slice(2, 8)}.local`;
        this.cacheControl = opts.cacheControl ?? "public, max-age=60";
    }

    async getItems(opts?: CDNGetItemsOptions): Promise<CDNResponse<CDNItemsPage>> {
        let items = [...this._files.values()] as CDNItem[];
        if (opts?.search) {
            const q = opts.search.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(q));
        }
        const limit = opts?.pagination?.limit ?? (items.length || 1);
        const page  = opts?.pagination?.page  ?? 1;
        const start = (page - 1) * limit;
        const slice = items.slice(start, start + limit);
        return {
            ok: true,
            data: {
                items: slice,
                total: items.length,
                page, limit,
                hasMore: start + slice.length < items.length,
            },
        };
    }

    async getItem(id: string): Promise<CDNResponse<CDNItem>> {
        const f = this._files.get(id);
        if (!f) return { ok: false, error: { code: "not_found", message: id } };
        return { ok: true, data: f };
    }

    async uploadFile(opts: CDNUploadFileOptions): Promise<CDNResponse<FileMetadata>> {
        const existingByName = this._byName.get(opts.name);
        if (existingByName && !opts.overwrite) {
            return { ok: false, error: { code: "conflict", message: `name "${opts.name}" already in use` } };
        }
        if (opts.publicPath) {
            const otherId = this._byPublicPath.get(opts.publicPath);
            if (otherId && otherId !== existingByName && !opts.overwrite) {
                return { ok: false, error: { code: "conflict", message: `publicPath "${opts.publicPath}" already in use` } };
            }
        }

        const id    = existingByName ?? `f${this._nextId++}`;
        const bytes = await this._toBytes(opts.data);
        const absoluteURL = opts.publicPath
            ? `${this._urlPrefix}/${opts.publicPath}`
            : `${this._urlPrefix}/by-id/${id}`;

        const meta: FileMetadata = {
            id,
            name: opts.name,
            parentFolderID: null,
            createdAt: this._files.get(id)?.createdAt ?? new Date(),
            updatedAt: new Date(),
            size: bytes.byteLength,
            mimeType: opts.mimeType ?? "application/octet-stream",
            absoluteURL,
            publicPath: opts.publicPath,
            type: "other",
        };

        // Clean previous mappings on overwrite (publicPath could have moved).
        const prev = this._files.get(id);
        if (prev?.publicPath && prev.publicPath !== opts.publicPath) {
            this._byPublicPath.delete(prev.publicPath);
        }

        this._files.set(id, meta);
        this._bytes.set(id, bytes);
        this._byName.set(opts.name, id);
        if (opts.publicPath) this._byPublicPath.set(opts.publicPath, id);
        return { ok: true, data: meta };
    }

    async createFolder(_opts: CDNCreateFolderOptions): Promise<CDNResponse<FolderMetadata>> {
        return { ok: false, error: { code: "unsupported_operation", message: "InMemoryCDN does not support folders" } };
    }

    async updateItem(_opts: CDNUpdateItemOptions): Promise<CDNResponse<CDNItem>> {
        return { ok: false, error: { code: "unsupported_operation", message: "InMemoryCDN does not support updateItem" } };
    }

    async deleteItem(opts: CDNDeleteItemOptions): Promise<CDNResponse<{ id: string }>> {
        const file = this._files.get(opts.id);
        if (!file) return { ok: false, error: { code: "not_found", message: opts.id } };
        this._files.delete(opts.id);
        this._bytes.delete(opts.id);
        this._byName.delete(file.name);
        if (file.publicPath) this._byPublicPath.delete(file.publicPath);
        return { ok: true, data: { id: opts.id } };
    }

    /** Resolve a URL produced by this bucket back to its bytes, or `null` if
     *  the URL was not produced by it / the file has been deleted. */
    fetchBytes(url: string): Uint8Array | null {
        if (!url.startsWith(this._urlPrefix + "/")) return null;
        const tail = url.slice(this._urlPrefix.length + 1);
        if (tail.startsWith("by-id/")) {
            return this._bytes.get(tail.slice("by-id/".length)) ?? null;
        }
        const id = this._byPublicPath.get(tail);
        return id ? this._bytes.get(id) ?? null : null;
    }

    /** Test helper: how many files are currently stored. */
    size(): number { return this._files.size; }

    private async _toBytes(data: Blob | Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
        if (data instanceof Uint8Array) return data;
        if (data instanceof Blob)       return new Uint8Array(await data.arrayBuffer());
        const reader = data.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) { chunks.push(value); total += value.byteLength; }
        }
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.byteLength; }
        return out;
    }
}

/**
 * `fetch`-shaped resolver that consults a list of `InMemoryCDN` buckets.
 * Inject in `DeliveryBuilder.deps.fetcher` so `loadManifest` can read the
 * manifest bytes during integration tests without standing up an HTTP
 * server.
 */
export function makeCdnFetcher(buckets: readonly InMemoryCDN[]): typeof fetch {
    const f = async (input: URL | RequestInfo): Promise<Response> => {
        const url = typeof input === "string"
            ? input
            : input instanceof URL ? input.toString() : input.url;
        for (const b of buckets) {
            const bytes = b.fetchBytes(url);
            if (bytes) {
                return new Response(bytes as BodyInit, { status: 200 });
            }
        }
        return new Response(null, { status: 404 });
    };
    // `typeof fetch` carries Bun's `preconnect` static; tests don't need it
    // but the type system does. Cast through `unknown` to avoid spreading
    // the noise everywhere.
    return f as unknown as typeof fetch;
}

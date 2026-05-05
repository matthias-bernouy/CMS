import type {
    Media,
    MediaUrlBuilder,
    MediaItem,
    MediaItemsPage,
    FolderMetadata,
    FileMetadata,
    MediaResponse,
    MediaError,
    MediaGetItemsOptions,
    MediaUploadFileOptions,
    MediaCreateFolderOptions,
    MediaUpdateItemOptions,
    MediaDeleteItemOptions,
    MediaFormatImageOptions,
    ImageFormat,
} from "@bernouy/socle";

/**
 * Browser-deployable consumer that talks to `InMemoryMediaServer` over
 * HTTP. Self-contained per the `Media` portability contract: no module-
 * level helpers, no runtime imports, every helper is a private method.
 *
 * `baseURL` is the same prefix the server's runner is mounted at — the
 * server registered `/media/*` under it (e.g. baseURL "/cms" hits
 * "/cms/media/items"). Image dimensions are probed in the browser so the
 * server stays free of image libs.
 */
export class HttpMedia implements Media {

    readonly imageConfig: MediaUrlBuilder["imageConfig"] = {
        maxWidth:       4096,
        maxHeight:      4096,
        ladderWidths:   [320, 640, 960, 1280, 1920],
        ladderFormats:  ["webp", "jpeg"] as ImageFormat[],
        defaultQuality: 80,
    };

    readonly limits: Media["limits"] = {
        maxFileSize:       50 * 1024 * 1024,
        acceptedMimeTypes: "*",
    };

    private _baseURL: string;

    constructor(baseURL: string) {
        this._baseURL = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
    }

    formatImageUrl(opts: MediaFormatImageOptions): URL {
        const url = new URL(opts.url);
        if (opts.width)   url.searchParams.set("w",   String(opts.width));
        if (opts.height)  url.searchParams.set("h",   String(opts.height));
        if (opts.fit)     url.searchParams.set("fit", opts.fit);
        if (opts.format)  url.searchParams.set("fm",  opts.format);
        if (opts.quality) url.searchParams.set("q",   String(opts.quality));
        return url;
    }

    async getItems(opts: MediaGetItemsOptions = {}): Promise<MediaResponse<MediaItemsPage>> {
        const params = new URLSearchParams();
        if (opts.folderID)             params.set("folderID",  opts.folderID);
        if (opts.accept?.length)       params.set("accept",    opts.accept.join(","));
        if (opts.search)               params.set("search",    opts.search);
        if (opts.sortBy)               params.set("sortBy",    opts.sortBy);
        if (opts.sortOrder)            params.set("sortOrder", opts.sortOrder);
        if (opts.recursive)            params.set("recursive", "true");
        if (opts.pagination?.page)     params.set("page",      String(opts.pagination.page));
        if (opts.pagination?.limit)    params.set("limit",     String(opts.pagination.limit));
        const r = await this._json<MediaItemsPage>(`/media/items?${params}`, { method: "GET" });
        return this._reviveItemsPage(r);
    }

    async getItem(id: string): Promise<MediaResponse<MediaItem>> {
        const r = await this._json<MediaItem>(`/media/item?id=${encodeURIComponent(id)}`, { method: "GET" });
        return this._reviveItem(r);
    }

    async uploadFile(opts: MediaUploadFileOptions): Promise<MediaResponse<FileMetadata>> {
        const blob = opts.data instanceof Blob
            ? opts.data
            : opts.data instanceof Uint8Array
                ? new Blob([opts.data as Uint8Array<ArrayBuffer>], { type: opts.mimeType ?? "application/octet-stream" })
                : await this._streamToBlob(opts.data, opts.mimeType ?? "application/octet-stream");

        const fd = new FormData();
        fd.set("file", blob, opts.name);
        fd.set("name", opts.name);
        if (opts.folderID)              fd.set("folderID",  opts.folderID);
        if (opts.overwrite)             fd.set("overwrite", "true");
        if (opts.mimeType)              fd.set("mimeType",  opts.mimeType);
        if (opts.size !== undefined)    fd.set("size",      String(opts.size));

        const probedMime = opts.mimeType ?? blob.type;
        if (probedMime.startsWith("image/")) {
            const dims = await this._readImageDimensions(blob);
            fd.set("width",  String(dims.width));
            fd.set("height", String(dims.height));
        }

        const r = await this._json<FileMetadata>("/media/upload", { method: "POST", body: fd, signal: opts.signal });
        return this._reviveItem(r) as MediaResponse<FileMetadata>;
    }

    async createFolder(opts: MediaCreateFolderOptions): Promise<MediaResponse<FolderMetadata>> {
        const r = await this._json<FolderMetadata>("/media/folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(opts),
        });
        return this._reviveItem(r) as MediaResponse<FolderMetadata>;
    }

    async updateItem(opts: MediaUpdateItemOptions): Promise<MediaResponse<MediaItem>> {
        const r = await this._json<MediaItem>(`/media/item?id=${encodeURIComponent(opts.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: opts.name, parentFolderID: opts.parentFolderID }),
        });
        return this._reviveItem(r);
    }

    async deleteItem(opts: MediaDeleteItemOptions): Promise<MediaResponse<{ id: string }>> {
        const params = new URLSearchParams({ id: opts.id });
        if (opts.recursive) params.set("recursive", "true");
        return this._json<{ id: string }>(`/media/item?${params}`, { method: "DELETE" });
    }

    private async _json<T>(path: string, init: RequestInit): Promise<MediaResponse<T>> {
        try {
            const res = await fetch(this._baseURL + path, init);
            return await res.json() as MediaResponse<T>;
        } catch (e) {
            const error: MediaError = {
                code: "storage_unavailable",
                message: (e as Error)?.message ?? "Network error",
                cause: e,
            };
            return { ok: false, error };
        }
    }

    private _reviveItem<T extends MediaItem>(r: MediaResponse<T>): MediaResponse<T> {
        if (!r.ok) return r;
        return { ok: true, data: this._reviveDates(r.data) };
    }

    private _reviveItemsPage(r: MediaResponse<MediaItemsPage>): MediaResponse<MediaItemsPage> {
        if (!r.ok) return r;
        return { ok: true, data: { ...r.data, items: r.data.items.map(i => this._reviveDates(i)) } };
    }

    private _reviveDates<T extends MediaItem>(item: T): T {
        return { ...item, createdAt: new Date(item.createdAt as unknown as string), updatedAt: new Date(item.updatedAt as unknown as string) };
    }

    private async _streamToBlob(stream: ReadableStream<Uint8Array>, mimeType: string): Promise<Blob> {
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
        }
        return new Blob(chunks as Uint8Array<ArrayBuffer>[], { type: mimeType });
    }

    private _readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve({ width: 0, height: 0 });
            };
            img.src = url;
        });
    }
}

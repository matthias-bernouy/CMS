import type {
    Media,
    MediaUrlBuilder,
    MediaItem,
    MediaItemsPage,
    FolderMetadata,
    FileMetadata,
    ImageFileMetadata,
    GenericFileMetadata,
    MediaResponse,
    MediaError,
    MediaErrorCode,
    MediaGetItemsOptions,
    MediaUploadFileOptions,
    MediaCreateFolderOptions,
    MediaUpdateItemOptions,
    MediaDeleteItemOptions,
    MediaFormatImageOptions,
    ImageFormat,
    FileType,
} from "@bernouy/socle";

// ─────────────────────────────────────────────────────────────
// Helpers (methods only — no module-level functions per contract)
// ─────────────────────────────────────────────────────────────

export class InMemoryMedia implements Media {

    // ── Config ──

    readonly imageConfig: MediaUrlBuilder["imageConfig"] = {
        maxWidth:       4096,
        maxHeight:      4096,
        ladderWidths:   [320, 640, 960, 1280, 1920],
        ladderFormats:  ["webp", "jpeg"] as ImageFormat[],
        defaultQuality: 80,
    };

    readonly limits: Media["limits"] = {
        maxFileSize:        50 * 1024 * 1024, // 50 MB
        acceptedMimeTypes:  "*",
    };

    // ── Storage ──

    private _items: Map<string, MediaItem> = new Map();
    private _counter: number = 0;

    // ── Public API ──

    formatImageUrl(opts: MediaFormatImageOptions): URL {
        const url = new URL(opts.url);
        if (opts.width)   url.searchParams.set("w",       String(opts.width));
        if (opts.height)  url.searchParams.set("h",       String(opts.height));
        if (opts.fit)     url.searchParams.set("fit",     opts.fit);
        if (opts.format)  url.searchParams.set("fm",      opts.format);
        if (opts.quality) url.searchParams.set("q",       String(opts.quality));
        return url;
    }

    async getItems(opts: MediaGetItemsOptions = {}): Promise<MediaResponse<MediaItemsPage>> {
        const folderID   = opts.folderID ?? null;
        const accept     = opts.accept;
        const search     = opts.search?.toLowerCase();
        const sortBy     = opts.sortBy     ?? "name";
        const sortOrder  = opts.sortOrder  ?? "asc";
        const page       = opts.pagination?.page  ?? 1;
        const limit      = opts.pagination?.limit ?? 50;

        // Validate target folder exists (unless root).
        if (folderID !== null && folderID !== undefined) {
            const folder = this._items.get(folderID);
            if (!folder) return this._err("not_found", `Folder "${folderID}" not found`);
            if (folder.type !== "folder") return this._err("not_found", `"${folderID}" is not a folder`);
        }

        let items = Array.from(this._items.values()).filter(item => {
            if (opts.recursive) {
                // Include everything under the target folder (any depth).
                return this._isDescendantOf(item, folderID);
            }
            return item.parentFolderID === (folderID ?? null);
        });

        if (accept?.length) {
            items = items.filter(i => accept.includes(i.type));
        }

        if (search) {
            items = items.filter(i => i.name.toLowerCase().includes(search));
        }

        items = this._sort(items, sortBy, sortOrder);

        const total  = items.length;
        const start  = (page - 1) * limit;
        const slice  = items.slice(start, start + limit);

        return {
            ok:   true,
            data: { items: slice, total, page, limit, hasMore: start + limit < total },
        };
    }

    async getItem(id: string): Promise<MediaResponse<MediaItem>> {
        const item = this._items.get(id);
        if (!item) return this._err("not_found", `Item "${id}" not found`);
        return { ok: true, data: item };
    }

    async uploadFile(opts: MediaUploadFileOptions): Promise<MediaResponse<FileMetadata>> {
        const folderID = opts.folderID ?? null;

        if (folderID !== null) {
            const folder = this._items.get(folderID);
            if (!folder) return this._err("not_found", `Folder "${folderID}" not found`);
            if (folder.type !== "folder") return this._err("not_found", `"${folderID}" is not a folder`);
        }

        const nameError = this._validateName(opts.name);
        if (nameError) return nameError;

        const mimeType = opts.mimeType ?? (opts.data instanceof Blob ? opts.data.type : "application/octet-stream");

        // Size validation.
        const size = opts.size ?? (opts.data instanceof Blob ? opts.data.size : 0);
        if (size > this.limits.maxFileSize) {
            return this._err("file_too_large", `File exceeds the ${this.limits.maxFileSize}-byte limit`);
        }

        // Conflict check.
        const conflict = this._findByNameInFolder(opts.name, folderID);
        if (conflict) {
            if (!opts.overwrite) return this._err("conflict", `A file named "${opts.name}" already exists in this folder`);
            this._items.delete(conflict.id);
        }

        // Build an object URL from the Blob payload (browser-native, no Node APIs).
        let absoluteURL: string;
        if (opts.data instanceof Blob) {
            absoluteURL = URL.createObjectURL(opts.data);
        } else if (opts.data instanceof Uint8Array) {
            absoluteURL = URL.createObjectURL(new Blob([opts.data as Uint8Array<ArrayBuffer>], { type: mimeType }));
        } else {
            // ReadableStream: consume into a Blob first.
            const reader = opts.data.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }
            absoluteURL = URL.createObjectURL(new Blob(chunks as Uint8Array<ArrayBuffer>[], { type: mimeType }));
        }

        const now  = new Date();
        const id   = this._nextId();
        const base = {
            id,
            name:           opts.name,
            parentFolderID: folderID,
            size,
            mimeType,
            absoluteURL,
            createdAt: now,
            updatedAt: now,
        };

        let file: FileMetadata;
        if (mimeType.startsWith("image/")) {
            const imageInfo = await this._readImageDimensions(absoluteURL);
            file = { ...base, type: "image", imageInfo } as ImageFileMetadata;
        } else {
            const fileType = this._mimeToFileType(mimeType);
            file = { ...base, type: fileType } as GenericFileMetadata;
        }

        this._items.set(id, file);
        return { ok: true, data: file };
    }

    async createFolder(opts: MediaCreateFolderOptions): Promise<MediaResponse<FolderMetadata>> {
        const parentFolderID = opts.parentFolderID ?? null;

        if (parentFolderID !== null) {
            const parent = this._items.get(parentFolderID);
            if (!parent) return this._err("destination_not_found", `Parent folder "${parentFolderID}" not found`);
            if (parent.type !== "folder") return this._err("destination_not_found", `"${parentFolderID}" is not a folder`);
        }

        const nameError = this._validateName(opts.name);
        if (nameError) return nameError;

        const conflict = this._findByNameInFolder(opts.name, parentFolderID);
        if (conflict) return this._err("conflict", `A folder named "${opts.name}" already exists here`);

        const now: Date   = new Date();
        const id:  string = this._nextId();
        const folder: FolderMetadata = {
            id,
            type:           "folder",
            name:           opts.name,
            parentFolderID,
            itemCount:      0,
            createdAt:      now,
            updatedAt:      now,
        };

        this._items.set(id, folder);
        return { ok: true, data: folder };
    }

    async updateItem(opts: MediaUpdateItemOptions): Promise<MediaResponse<MediaItem>> {
        const item = this._items.get(opts.id);
        if (!item) return this._err("not_found", `Item "${opts.id}" not found`);

        const targetFolderID = opts.parentFolderID !== undefined
            ? opts.parentFolderID
            : item.parentFolderID;

        // Validate destination folder.
        if (targetFolderID !== null && targetFolderID !== item.parentFolderID) {
            const dest = this._items.get(targetFolderID);
            if (!dest) return this._err("destination_not_found", `Destination folder "${targetFolderID}" not found`);
            if (dest.type !== "folder") return this._err("destination_not_found", `"${targetFolderID}" is not a folder`);
        }

        // Prevent moving a folder into one of its own descendants.
        if (item.type === "folder" && opts.parentFolderID !== undefined && opts.parentFolderID !== null) {
            if (this._isDescendantOf(this._items.get(opts.parentFolderID)!, item.id)) {
                return this._err("validation_error", "Cannot move a folder into one of its own descendants");
            }
        }

        const targetName = opts.name ?? item.name;

        if (opts.name !== undefined) {
            const nameError = this._validateName(opts.name);
            if (nameError) return nameError;
        }

        // Conflict check in destination.
        const conflict = this._findByNameInFolder(targetName, targetFolderID ?? null);
        if (conflict && conflict.id !== item.id) {
            return this._err("conflict", `An item named "${targetName}" already exists in the destination folder`);
        }

        const updated: MediaItem = {
            ...item,
            name:           targetName,
            parentFolderID: targetFolderID ?? null,
            updatedAt:      new Date(),
        } as MediaItem;

        this._items.set(opts.id, updated);
        return { ok: true, data: updated };
    }

    async deleteItem(opts: MediaDeleteItemOptions): Promise<MediaResponse<{ id: string }>> {
        const item = this._items.get(opts.id);
        if (!item) return this._err("not_found", `Item "${opts.id}" not found`);

        if (item.type === "folder") {
            const children = Array.from(this._items.values()).filter(
                i => i.parentFolderID === opts.id
            );
            if (children.length > 0) {
                if (!opts.recursive) return this._err("folder_not_empty", `Folder "${opts.id}" is not empty`);
                this._deleteSubtree(opts.id);
            }
        }

        this._items.delete(opts.id);
        return { ok: true, data: { id: opts.id } };
    }

    // ── Private helpers (all must be methods — no module-level functions) ──

    private _nextId(): string {
        return `mem-${(++this._counter).toString(16).padStart(8, "0")}`;
    }

    private _err(code: MediaErrorCode, message: string): { ok: false; error: MediaError } {
        return { ok: false, error: { code, message } };
    }

    private _validateName(name: string): { ok: false; error: MediaError } | null {
        if (!name || name.trim().length === 0 || name === ".." || /[/\\]/.test(name)) {
            return this._err("invalid_name", `Invalid name: "${name}"`);
        }
        return null;
    }

    private _findByNameInFolder(name: string, folderID: string | null): MediaItem | undefined {
        const lower = name.toLowerCase();
        return Array.from(this._items.values()).find(
            i => i.parentFolderID === folderID && i.name.toLowerCase() === lower
        );
    }

    private _isDescendantOf(item: MediaItem, ancestorID: string | null): boolean {
        let current: MediaItem | undefined = item;
        while (current) {
            if (current.parentFolderID === ancestorID) return true;
            if (current.parentFolderID === null) return false;
            current = this._items.get(current.parentFolderID);
        }
        return false;
    }

    private _deleteSubtree(folderID: string): void {
        const children = Array.from(this._items.values()).filter(
            i => i.parentFolderID === folderID
        );
        for (const child of children) {
            if (child.type === "folder") this._deleteSubtree(child.id);
            this._items.delete(child.id);
        }
    }

    private _sort(items: MediaItem[], by: string, order: "asc" | "desc"): MediaItem[] {
        return [...items].sort((a, b) => {
            let cmp = 0;
            if (by === "name") {
                cmp = a.name.localeCompare(b.name);
            } else if (by === "createdAt") {
                cmp = a.createdAt.getTime() - b.createdAt.getTime();
            } else if (by === "updatedAt") {
                cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
            } else if (by === "size") {
                const aSize = "size" in a ? a.size : 0;
                const bSize = "size" in b ? b.size : 0;
                cmp = aSize - bSize;
            }
            return order === "asc" ? cmp : -cmp;
        });
    }

    private _mimeToFileType(mimeType: string): Exclude<FileType, "image"> {
        if (mimeType.startsWith("video/"))       return "video";
        if (mimeType.startsWith("audio/"))       return "audio";
        if (mimeType === "application/pdf")      return "pdf";
        if (mimeType.startsWith("text/"))        return "text";
        if (
            mimeType === "application/zip"                ||
            mimeType === "application/x-tar"              ||
            mimeType === "application/gzip"               ||
            mimeType === "application/x-7z-compressed"    ||
            mimeType === "application/x-rar-compressed"
        ) return "archive";
        if (
            mimeType.includes("word")         ||
            mimeType.includes("spreadsheet")  ||
            mimeType.includes("presentation") ||
            mimeType.includes("opendocument")
        ) return "document";
        return "other";
    }

    /**
     * Reads the intrinsic dimensions of an image via a browser HTMLImageElement.
     * Falls back to { width: 0, height: 0 } if the load fails.
     * Browser-only — no Node `canvas` dependency.
     */
    private _readImageDimensions(url: string): Promise<{ width: number; height: number }> {
        return new Promise(resolve => {
            const img = new Image();
            img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = url;
        });
    }
}
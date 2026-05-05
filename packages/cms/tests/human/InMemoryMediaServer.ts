import type {
    Runner,
    MediaItem,
    MediaItemsPage,
    FolderMetadata,
    FileMetadata,
    ImageFileMetadata,
    GenericFileMetadata,
    MediaError,
    MediaErrorCode,
    FileType,
} from "@bernouy/socle";

const STATUS_BY_CODE: Record<MediaErrorCode, number> = {
    not_found: 404, unauthorized: 401, forbidden: 403, conflict: 409,
    folder_not_empty: 409, destination_not_found: 404, invalid_name: 400,
    validation_error: 400, unsupported_mime_type: 415, file_too_large: 413,
    quota_exceeded: 507, rate_limited: 429, storage_unavailable: 503,
    unsupported_operation: 501, unknown: 500,
};

/**
 * In-memory server companion for `HttpMedia`. Holds bytes and metadata,
 * registers `/media/*` routes on the given Runner. No transforms — query
 * params on `/media/file` are ignored (the harness returns the original).
 * Image dimensions are captured browser-side at upload and forwarded as
 * form fields (`width`, `height`) — no server-side image lib.
 */
export class InMemoryMediaServer {

    static readonly MAX_FILE_SIZE = 50 * 1024 * 1024;

    private _items: Map<string, MediaItem> = new Map();
    private _bytes: Map<string, Uint8Array> = new Map();
    private _counter: number = 0;
    private _basePath: string;

    constructor(runner: Runner) {
        this._basePath = runner.basePath === "/" ? "" : runner.basePath;
        runner.group("/media", (r) => {
            r.get("/items",   (req) => this._handleList(req));
            r.get("/item",    (req) => this._handleGet(req));
            r.get("/file",    (req) => this._handleFile(req));
            r.post("/upload", (req) => this._handleUpload(req));
            r.post("/folder", (req) => this._handleCreateFolder(req));
            r.patch("/item",  (req) => this._handleUpdate(req));
            r.delete("/item", (req) => this._handleDelete(req));
        });
    }

    private async _handleList(req: Request): Promise<Response> {
        const u = new URL(req.url);
        const folderID = u.searchParams.get("folderID");
        const accept = u.searchParams.get("accept")?.split(",").filter(Boolean) as MediaItem["type"][] | undefined;
        const search = u.searchParams.get("search")?.toLowerCase();
        const sortBy = (u.searchParams.get("sortBy") ?? "name") as "name" | "createdAt" | "updatedAt" | "size";
        const sortOrder = (u.searchParams.get("sortOrder") ?? "asc") as "asc" | "desc";
        const page = Number(u.searchParams.get("page") ?? "1");
        const limit = Number(u.searchParams.get("limit") ?? "50");
        const recursive = u.searchParams.get("recursive") === "true";

        if (folderID) {
            const folder = this._items.get(folderID);
            if (!folder) return this._err("not_found", `Folder "${folderID}" not found`);
            if (folder.type !== "folder") return this._err("not_found", `"${folderID}" is not a folder`);
        }

        let items = Array.from(this._items.values()).filter(item =>
            recursive ? this._isDescendantOf(item, folderID ?? null)
                      : item.parentFolderID === (folderID ?? null)
        );
        if (accept?.length) items = items.filter(i => accept.includes(i.type));
        if (search) items = items.filter(i => i.name.toLowerCase().includes(search));
        items = this._sort(items, sortBy, sortOrder);

        const total = items.length;
        const start = (page - 1) * limit;
        const slice = items.slice(start, start + limit).map(i => this._withURL(i, req));
        const data: MediaItemsPage = { items: slice, total, page, limit, hasMore: start + limit < total };
        return this._ok(data);
    }

    private async _handleGet(req: Request): Promise<Response> {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return this._err("validation_error", "Missing id");
        const item = this._items.get(id);
        if (!item) return this._err("not_found", `Item "${id}" not found`);
        return this._ok(this._withURL(item, req));
    }

    private async _handleFile(req: Request): Promise<Response> {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return new Response("", { status: 400 });
        const item = this._items.get(id);
        const bytes = this._bytes.get(id);
        if (!item || item.type === "folder" || !bytes) return new Response("", { status: 404 });
        const file = item as FileMetadata;
        return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
            headers: { "Content-Type": file.mimeType, "Content-Length": String(file.size) },
        });
    }

    private async _handleUpload(req: Request): Promise<Response> {
        const form = await req.formData();
        const blob = form.get("file");
        const name = form.get("name") as string | null;
        const folderID = (form.get("folderID") as string | null) || null;
        const overwrite = form.get("overwrite") === "true";
        const widthStr = form.get("width") as string | null;
        const heightStr = form.get("height") as string | null;

        if (!(blob instanceof Blob) || !name) return this._err("validation_error", "Missing file or name");
        if (folderID) {
            const folder = this._items.get(folderID);
            if (!folder) return this._err("not_found", `Folder "${folderID}" not found`);
            if (folder.type !== "folder") return this._err("not_found", `"${folderID}" is not a folder`);
        }
        const nameError = this._validateName(name);
        if (nameError) return this._errFrom(nameError);

        const size = blob.size;
        if (size > InMemoryMediaServer.MAX_FILE_SIZE) {
            return this._err("file_too_large", `File exceeds the ${InMemoryMediaServer.MAX_FILE_SIZE}-byte limit`);
        }

        const conflict = this._findByNameInFolder(name, folderID);
        if (conflict) {
            if (!overwrite) return this._err("conflict", `A file named "${name}" already exists in this folder`);
            this._items.delete(conflict.id);
            this._bytes.delete(conflict.id);
        }

        const buf = new Uint8Array(await blob.arrayBuffer());
        const mimeType = blob.type || "application/octet-stream";
        const id = this._nextId();
        const now = new Date();
        const base = {
            id, name, parentFolderID: folderID, size, mimeType,
            absoluteURL: this._fileURL(req, id),
            createdAt: now, updatedAt: now,
        };

        let meta: FileMetadata;
        if (mimeType.startsWith("image/")) {
            const width = widthStr ? Number(widthStr) : 0;
            const height = heightStr ? Number(heightStr) : 0;
            meta = { ...base, type: "image", imageInfo: { width, height } } as ImageFileMetadata;
        } else {
            meta = { ...base, type: this._mimeToFileType(mimeType) } as GenericFileMetadata;
        }

        this._items.set(id, meta);
        this._bytes.set(id, buf);
        return this._ok(meta);
    }

    private async _handleCreateFolder(req: Request): Promise<Response> {
        const body = await req.json() as { name: string; parentFolderID?: string | null };
        const parentFolderID = body.parentFolderID ?? null;

        if (parentFolderID) {
            const parent = this._items.get(parentFolderID);
            if (!parent) return this._err("destination_not_found", `Parent folder "${parentFolderID}" not found`);
            if (parent.type !== "folder") return this._err("destination_not_found", `"${parentFolderID}" is not a folder`);
        }
        const nameError = this._validateName(body.name);
        if (nameError) return this._errFrom(nameError);
        const conflict = this._findByNameInFolder(body.name, parentFolderID);
        if (conflict) return this._err("conflict", `A folder named "${body.name}" already exists here`);

        const now = new Date();
        const id = this._nextId();
        const folder: FolderMetadata = {
            id, type: "folder", name: body.name, parentFolderID,
            itemCount: 0, createdAt: now, updatedAt: now,
        };
        this._items.set(id, folder);
        return this._ok(folder);
    }

    private async _handleUpdate(req: Request): Promise<Response> {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return this._err("validation_error", "Missing id");
        const item = this._items.get(id);
        if (!item) return this._err("not_found", `Item "${id}" not found`);

        const body = await req.json() as { name?: string; parentFolderID?: string | null };
        const targetFolderID = body.parentFolderID !== undefined ? body.parentFolderID : item.parentFolderID;

        if (targetFolderID && targetFolderID !== item.parentFolderID) {
            const dest = this._items.get(targetFolderID);
            if (!dest) return this._err("destination_not_found", `Destination folder "${targetFolderID}" not found`);
            if (dest.type !== "folder") return this._err("destination_not_found", `"${targetFolderID}" is not a folder`);
        }
        if (item.type === "folder" && body.parentFolderID) {
            if (this._isDescendantOf(this._items.get(body.parentFolderID)!, item.id)) {
                return this._err("validation_error", "Cannot move a folder into one of its own descendants");
            }
        }
        const targetName = body.name ?? item.name;
        if (body.name !== undefined) {
            const nameError = this._validateName(body.name);
            if (nameError) return this._errFrom(nameError);
        }
        const conflict = this._findByNameInFolder(targetName, targetFolderID ?? null);
        if (conflict && conflict.id !== item.id) {
            return this._err("conflict", `An item named "${targetName}" already exists in the destination folder`);
        }

        const updated = { ...item, name: targetName, parentFolderID: targetFolderID ?? null, updatedAt: new Date() } as MediaItem;
        this._items.set(id, updated);
        return this._ok(this._withURL(updated, req));
    }

    private async _handleDelete(req: Request): Promise<Response> {
        const u = new URL(req.url);
        const id = u.searchParams.get("id");
        const recursive = u.searchParams.get("recursive") === "true";
        if (!id) return this._err("validation_error", "Missing id");
        const item = this._items.get(id);
        if (!item) return this._err("not_found", `Item "${id}" not found`);
        if (item.type === "folder") {
            const children = Array.from(this._items.values()).filter(i => i.parentFolderID === id);
            if (children.length > 0) {
                if (!recursive) return this._err("folder_not_empty", `Folder "${id}" is not empty`);
                this._deleteSubtree(id);
            }
        }
        this._items.delete(id);
        this._bytes.delete(id);
        return this._ok({ id });
    }

    private _nextId(): string {
        return `mem-${(++this._counter).toString(16).padStart(8, "0")}`;
    }
    private _validateName(name: string): MediaError | null {
        if (!name || name.trim().length === 0 || name === ".." || /[/\\]/.test(name)) {
            return { code: "invalid_name", message: `Invalid name: "${name}"` };
        }
        return null;
    }
    private _findByNameInFolder(name: string, folderID: string | null): MediaItem | undefined {
        const lower = name.toLowerCase();
        return Array.from(this._items.values()).find(i =>
            i.parentFolderID === folderID && i.name.toLowerCase() === lower
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
        const children = Array.from(this._items.values()).filter(i => i.parentFolderID === folderID);
        for (const child of children) {
            if (child.type === "folder") this._deleteSubtree(child.id);
            this._items.delete(child.id);
            this._bytes.delete(child.id);
        }
    }
    private _sort(items: MediaItem[], by: "name" | "createdAt" | "updatedAt" | "size", order: "asc" | "desc"): MediaItem[] {
        return [...items].sort((a, b) => {
            let cmp = 0;
            if (by === "name") cmp = a.name.localeCompare(b.name);
            else if (by === "createdAt") cmp = a.createdAt.getTime() - b.createdAt.getTime();
            else if (by === "updatedAt") cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
            else if (by === "size") {
                const aSize = "size" in a ? a.size : 0;
                const bSize = "size" in b ? b.size : 0;
                cmp = aSize - bSize;
            }
            return order === "asc" ? cmp : -cmp;
        });
    }
    private _mimeToFileType(mimeType: string): Exclude<FileType, "image"> {
        if (mimeType.startsWith("video/")) return "video";
        if (mimeType.startsWith("audio/")) return "audio";
        if (mimeType === "application/pdf") return "pdf";
        if (mimeType.startsWith("text/")) return "text";
        if (mimeType === "application/zip" || mimeType === "application/x-tar"
            || mimeType === "application/gzip" || mimeType === "application/x-7z-compressed"
            || mimeType === "application/x-rar-compressed") return "archive";
        if (mimeType.includes("word") || mimeType.includes("spreadsheet")
            || mimeType.includes("presentation") || mimeType.includes("opendocument")) return "document";
        return "other";
    }
    private _fileURL(req: Request, id: string): string {
        return `${new URL(req.url).origin}${this._basePath}/media/file?id=${id}`;
    }
    private _withURL(item: MediaItem, req: Request): MediaItem {
        if (item.type === "folder") return item;
        return { ...item, absoluteURL: this._fileURL(req, item.id) };
    }
    private _ok(data: unknown): Response {
        return new Response(JSON.stringify({ ok: true, data }),
            { headers: { "Content-Type": "application/json" } });
    }
    private _err(code: MediaErrorCode, message: string): Response {
        return new Response(JSON.stringify({ ok: false, error: { code, message } }),
            { status: STATUS_BY_CODE[code], headers: { "Content-Type": "application/json" } });
    }
    private _errFrom(err: MediaError): Response {
        return new Response(JSON.stringify({ ok: false, error: err }),
            { status: STATUS_BY_CODE[err.code], headers: { "Content-Type": "application/json" } });
    }
}

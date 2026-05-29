import { readdir, mkdir, rename, rm, stat, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type {
    CmsFilesMetadataRepository, FilesItem, FolderItem, FileItem,
    FilesListOptions, FilesPage, NewFolder, NewFile, ItemPatch,
} from "cms-shared/interfaces/CmsFilesMetadataRepository";
import type { BlobInput, CmsFilesBlobStore } from "cms-shared/interfaces/CmsFilesBlobStore";

/**
 * Filesystem-native files store for local dev (`p9r dev`): the `<root>` dir IS
 * the tree. A folder = a directory, a file's name = its filename, its bytes =
 * the file. Implements BOTH the metadata tree and the blob store off the same
 * directory, so `<root>` (e.g. `site/files/`) is a plain, push-able folder.
 *
 * The `id` IS the POSIX relative path from `<root>` ("images" / "images/hero.png";
 * `null` parent = root). Unlike the opaque-id production store, a rename/move
 * therefore changes the id — accepted for the local FS model. `mimeType` and
 * `size` are derived from disk on read (the extension carries the type).
 */
export class LocalFsCmsFiles implements CmsFilesMetadataRepository, CmsFilesBlobStore {

    constructor(private readonly root: string) {}

    // ── metadata (tree) ──────────────────────────────────────────────

    async listChildren(parentId: string | null, opts: FilesListOptions = {}): Promise<FilesPage> {
        const dir = parentId ?? "";
        let names: string[];
        try { names = await readdir(this._abs(dir)); }
        catch { return { items: [], total: 0, page: 1, limit: 0, hasMore: false }; }

        let items = (await Promise.all(names.map(n => this._stat(dir ? `${dir}/${n}` : n)))).filter(Boolean) as FilesItem[];
        if (opts.accept) items = items.filter(i => opts.accept!.includes(i.type));
        if (opts.search) { const q = opts.search.toLowerCase(); items = items.filter(i => i.name.toLowerCase().includes(q)); }
        items.sort(comparator(opts.sortBy ?? "name", opts.sortOrder ?? "asc"));

        const total = items.length;
        const limit = opts.pagination?.limit ?? total;
        const page  = opts.pagination?.page  ?? 1;
        const start = opts.pagination ? (page - 1) * limit : 0;
        const slice = opts.pagination ? items.slice(start, start + limit) : items;
        return { items: slice, total, page, limit, hasMore: start + slice.length < total };
    }

    getItem(id: string): Promise<FilesItem | null> { return this._stat(normalize(id)); }
    getItemByPath(path: string): Promise<FilesItem | null> { return this._stat(normalize(path)); }

    async listSubtree(folderId: string): Promise<FilesItem[]> {
        const out: FilesItem[] = [];
        const stack = [normalize(folderId)];
        while (stack.length) {
            const cur = stack.pop()!;
            const page = await this.listChildren(cur);
            for (const i of page.items) { out.push(i); if (i.type === "folder") stack.push(i.id); }
        }
        return out;
    }

    async createFolder(input: NewFolder): Promise<FolderItem> {
        const id = this._childId(input.parentId, input.name);
        await this._assertFree(id);
        await mkdir(this._abs(id), { recursive: true });
        return (await this._stat(id)) as FolderItem;
    }

    async createFile(input: NewFile): Promise<FileItem> {
        const id = this._childId(input.parentId, input.name);
        await this._assertFree(id);
        await mkdir(this._abs(input.parentId ?? ""), { recursive: true });
        await writeFile(this._abs(id), "");          // touch; uploadFile's blob.put writes the bytes
        return (await this._stat(id)) as FileItem;
    }

    async updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        const cur = await this._stat(normalize(id));
        if (!cur) return null;
        const nextParent = patch.parentId !== undefined ? patch.parentId : cur.parentId;
        const nextName   = patch.name ?? cur.name;
        if (cur.type === "folder" && nextParent !== null && (nextParent === cur.id || nextParent.startsWith(cur.id + "/"))) {
            throw new Error("cannot move a folder into its own subtree");
        }
        const nextId = this._childId(nextParent, nextName);
        if (nextId !== cur.id) { await this._assertFree(nextId); await rename(this._abs(cur.id), this._abs(nextId)); }
        return this._stat(nextId);
    }

    async deleteItem(id: string, opts: { recursive?: boolean } = {}): Promise<{ deletedFileIds: string[] }> {
        const item = await this._stat(normalize(id));
        if (!item) return { deletedFileIds: [] };
        const files = item.type === "file" ? [item.id] : (await this.listSubtree(item.id)).filter(i => i.type === "file").map(i => i.id);
        if (item.type === "folder" && !opts.recursive && (await this.listChildren(item.id)).total > 0) {
            throw new Error("folder not empty");
        }
        await rm(this._abs(item.id), { recursive: true, force: true });
        return { deletedFileIds: files };
    }

    // ── blob (bytes) ─────────────────────────────────────────────────

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        const abs = this._abs(normalize(key));
        await mkdir(this._abs(parentOf(normalize(key)) ?? ""), { recursive: true });
        const size = await Bun.write(abs, new Response(data as BodyInit));
        return { size };
    }

    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
        const file = Bun.file(this._abs(normalize(key)));
        return (await file.exists()) ? file.stream() : null;
    }

    async delete(key: string): Promise<void> { await unlink(this._abs(normalize(key))).catch(() => {}); }
    async exists(key: string): Promise<boolean> { return Bun.file(this._abs(normalize(key))).exists(); }

    // ── helpers ──────────────────────────────────────────────────────

    private _childId(parentId: string | null, name: string): string {
        return parentId ? `${normalize(parentId)}/${name}` : name;
    }

    private async _assertFree(id: string): Promise<void> {
        if (await Bun.file(this._abs(id)).exists() || await isDir(this._abs(id))) {
            throw new Error(`"${id}" already exists in the destination folder`);
        }
    }

    private async _stat(id: string): Promise<FilesItem | null> {
        if (!id) return null;
        let s: Awaited<ReturnType<typeof stat>>;
        try { s = await stat(this._abs(id)); } catch { return null; }
        const base = { id, name: id.split("/").pop()!, parentId: parentOf(id), createdAt: s.birthtime, updatedAt: s.mtime };
        if (s.isDirectory()) return { ...base, type: "folder" };
        const f = Bun.file(this._abs(id));
        return { ...base, type: "file", size: s.size, mimeType: f.type || "application/octet-stream" };
    }

    private _abs(id: string): string {
        const segments = id.split("/").filter(Boolean);
        if (segments.some(s => s === "..")) throw new Error(`invalid path "${id}"`);
        return join(this.root, ...segments);
    }
}

function normalize(id: string): string {
    return id.split("/").map(s => s.trim()).filter(Boolean).join("/");
}

function parentOf(id: string): string | null {
    const i = id.lastIndexOf("/");
    return i === -1 ? null : id.slice(0, i);
}

async function isDir(abs: string): Promise<boolean> {
    try { return (await stat(abs)).isDirectory(); } catch { return false; }
}

function comparator(by: NonNullable<FilesListOptions["sortBy"]>, order: "asc" | "desc") {
    const dir = order === "asc" ? 1 : -1;
    return (a: FilesItem, b: FilesItem): number => {
        const av = sortKey(a, by); const bv = sortKey(b, by);
        if (av === bv) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return ((av as number) < (bv as number) ? -1 : 1) * dir;
    };
}

function sortKey(item: FilesItem, by: NonNullable<FilesListOptions["sortBy"]>): string | number | undefined {
    const v = (item as Record<string, unknown>)[by];
    if (v instanceof Date) return v.getTime();
    if (typeof v === "string" || typeof v === "number") return v;
    return undefined;
}

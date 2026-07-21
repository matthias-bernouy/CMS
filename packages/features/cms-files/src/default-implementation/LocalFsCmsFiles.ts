import { readdir, mkdir, rename, rm, stat, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUIDv7 } from "bun";
import type {
    CmsFilesMetadataRepository,
    FilesItem,
    FolderItem,
    FileItem,
    FilesListOptions,
    FilesPage,
    NewFolder,
    NewFile,
    ItemPatch,
} from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { BlobInput, CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { sha256Hex } from "cms-files/core/hashBytes";

/**
 * Filesystem-native files store for local dev (`p9r dev`): the `<root>` dir IS
 * the tree. A folder = a directory, a file's name = its filename, its bytes =
 * the file. Implements BOTH the metadata tree and the blob store off the same
 * directory, so `<root>` (e.g. `site/files/`) is a plain, push-able folder.
 *
 * Identity. The `id` is an opaque, stable `uuid` — NOT the path — kept in a
 * git-tracked registry (`<root>/../.cms-files-registry.json`, a sibling of
 * `files/`) that maps `uuid → { path, hash }` plus the inverse `path → uuid`.
 * A rename/move keeps the uuid (only the path changes), so id-addressed URLs
 * survive a media-tree reorg. The on-disk bytes stay path-organized (the dev
 * layout is the tree); the registry is the source of truth for `id↔path`.
 *
 * `hash` is `sha256(the bytes on disk)` for files (`null` for folders). It is a
 * RECOVERY KEY used only inside `reconcile` to re-link a file a developer moved
 * or renamed directly in their IDE (bypassing `updateItem`) back to its uuid —
 * never an item id, never a blob key.
 */
type RegistryEntry = { path: string; hash: string | null };
type Registry = { version: 1; byId: Record<string, RegistryEntry>; byPath: Record<string, string> };

export type ReconcileResult = {
    healed: { uuid: string; from: string; to: string }[]; // pure move/rename matched by hash
    minted: { uuid: string; path: string }[]; // genuinely-new file/folder
    deleted: { uuid: string; path: string }[]; // registry path gone + hash matched nothing
    errors: { path: string; error: string }[]; // I/O failure (NEVER delete an entry on I/O error)
};

export type ReconcileOptions = {
    /** Discard the existing registry first, then rebuild from disk. */
    force?: boolean;
};

export const CMS_FILES_REGISTRY_NAME = ".cms-files-registry.json";

export class LocalFsCmsFiles implements CmsFilesMetadataRepository, CmsFilesBlobStore {
    private readonly registryPath: string;
    private registry: Registry | null = null;
    private dirty = false;

    constructor(private readonly root: string) {
        this.registryPath = join(root, "..", CMS_FILES_REGISTRY_NAME);
    }

    // ── metadata (tree) ──────────────────────────────────────────────

    async listChildren(parentId: string | null, opts: FilesListOptions = {}): Promise<FilesPage> {
        await this._ensureRegistry();
        try {
            const dir = parentId === null ? "" : this.registry!.byId[parentId]?.path;
            if (dir === undefined) {
                return EMPTY_PAGE;
            }

            let names: string[];
            try {
                names = await readdir(this._abs(dir));
            } catch {
                return EMPTY_PAGE;
            }

            let items = (
                await Promise.all(
                    names.filter((n) => n !== CMS_FILES_REGISTRY_NAME).map((n) => this._stat(dir ? `${dir}/${n}` : n)),
                )
            ).filter(Boolean) as FilesItem[];
            if (opts.accept) {
                items = items.filter((i) => opts.accept!.includes(i.type));
            }
            if (opts.search) {
                const q = opts.search.toLowerCase();
                items = items.filter((i) => i.name.toLowerCase().includes(q));
            }
            items.sort(comparator(opts.sortBy ?? "name", opts.sortOrder ?? "asc"));

            const total = items.length;
            const limit = opts.pagination?.limit ?? total;
            const page = opts.pagination?.page ?? 1;
            const start = opts.pagination ? (page - 1) * limit : 0;
            const slice = opts.pagination ? items.slice(start, start + limit) : items;
            return { items: slice, total, page, limit, hasMore: start + slice.length < total };
        } finally {
            await this._flush();
        }
    }

    async getItem(id: string): Promise<FilesItem | null> {
        await this._ensureRegistry();
        try {
            const path = this.registry!.byId[id]?.path;
            return path === undefined ? null : this._stat(path);
        } finally {
            await this._flush();
        }
    }

    async getItemByPath(path: string): Promise<FilesItem | null> {
        await this._ensureRegistry();
        try {
            return this._stat(normalize(path));
        } finally {
            await this._flush();
        }
    }

    async listSubtree(folderId: string): Promise<FilesItem[]> {
        const out: FilesItem[] = [];
        const stack = [folderId];
        while (stack.length) {
            const page = await this.listChildren(stack.pop()!);
            for (const i of page.items) {
                out.push(i);
                if (i.type === "folder") {
                    stack.push(i.id);
                }
            }
        }
        return out;
    }

    async createFolder(input: NewFolder): Promise<FolderItem> {
        await this._ensureRegistry();
        try {
            const path = this._childPath(input.parentId, input.name);
            await this._assertFree(path);
            await mkdir(this._abs(path), { recursive: true });
            return (await this._stat(path)) as FolderItem; // mints the uuid via _resolveId
        } finally {
            await this._flush();
        }
    }

    async createFile(input: NewFile): Promise<FileItem> {
        await this._ensureRegistry();
        try {
            const path = this._childPath(input.parentId, input.name);
            await this._assertFree(path);
            await mkdir(this._abs(parentOf(path) ?? ""), { recursive: true });
            await writeFile(this._abs(path), ""); // touch; uploadFile's blob.put writes the bytes
            if (input.id) {
                // honor a caller-supplied id (record it, don't mint)
                this.registry!.byId[input.id] = { path, hash: sha256Hex(new Uint8Array()) };
                this.registry!.byPath[path] = input.id;
                this.dirty = true;
            }
            return (await this._stat(path)) as FileItem; // _resolveId returns input.id, or mints if absent
        } finally {
            await this._flush();
        }
    }

    async updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        await this._ensureRegistry();
        try {
            const curPath = this.registry!.byId[id]?.path;
            if (curPath === undefined) {
                return null;
            }
            const cur = await this._stat(curPath);
            if (!cur) {
                return null;
            }
            const nextParent = patch.parentId !== undefined ? patch.parentId : cur.parentId;
            const nextName = patch.name ?? cur.name;
            const nextParentPath = nextParent === null ? "" : this.registry!.byId[nextParent]?.path;
            if (nextParentPath === undefined) {
                throw new Error(`unknown parent "${nextParent}"`);
            }
            if (
                cur.type === "folder" &&
                nextParent !== null &&
                (nextParentPath === curPath || nextParentPath.startsWith(curPath + "/"))
            ) {
                throw new Error("cannot move a folder into its own subtree");
            }
            const nextPath = nextParentPath ? `${nextParentPath}/${nextName}` : nextName;
            if (nextPath !== curPath) {
                await this._assertFree(nextPath);
                await rename(this._abs(curPath), this._abs(nextPath));
                this._rewritePrefix(curPath, nextPath); // keeps every uuid; rewrites paths
            }
            return this._stat(nextPath);
        } finally {
            await this._flush();
        }
    }

    async updateFileContent(
        id: string,
        _fields: { size: number; mimeType: string; contentHash: string },
    ): Promise<FileItem | null> {
        // Content fields derive from disk: a preceding `put(id, bytes)` already
        // rewrote the bytes and refreshed the registry hash, so just re-stat.
        const item = await this.getItem(id);
        return item && item.type === "file" ? item : null;
    }

    async deleteItem(id: string, opts: { recursive?: boolean } = {}): Promise<{ deletedFileIds: string[] }> {
        await this._ensureRegistry();
        try {
            const path = this.registry!.byId[id]?.path;
            if (path === undefined) {
                return { deletedFileIds: [] };
            }
            const item = await this._stat(path);
            if (!item) {
                return { deletedFileIds: [] };
            }
            if (item.type === "folder" && !opts.recursive && (await this.listChildren(item.id)).total > 0) {
                throw new Error("folder not empty");
            }
            await rm(this._abs(path), { recursive: true, force: true });
            return { deletedFileIds: this._removeSubtree(path) };
        } finally {
            await this._flush();
        }
    }

    // ── blob (bytes) — keyed by uuid ─────────────────────────────────

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        await this._ensureRegistry();
        try {
            const path = this.registry!.byId[key]?.path;
            if (path === undefined) {
                throw new Error(`put: unknown id "${key}"`); // createFile mints first
            }
            const abs = this._abs(path);
            await mkdir(this._abs(parentOf(path) ?? ""), { recursive: true });
            const size = await Bun.write(abs, new Response(data as BodyInit));
            // Re-read the written bytes from disk — `data` may be a ReadableStream
            // already consumed by Bun.write, so it can never be hashed directly.
            this.registry!.byId[key]!.hash = sha256Hex(await Bun.file(abs).bytes());
            this.dirty = true;
            return { size };
        } finally {
            await this._flush();
        }
    }

    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
        await this._ensureRegistry();
        const path = this.registry!.byId[key]?.path;
        if (path === undefined) {
            return null;
        }
        const file = Bun.file(this._abs(path));
        return (await file.exists()) ? file.stream() : null;
    }

    async delete(key: string): Promise<void> {
        await this._ensureRegistry();
        const path = this.registry!.byId[key]?.path;
        if (path === undefined) {
            return; // idempotent; deleteItem already dropped it
        }
        await unlink(this._abs(path)).catch(() => {});
    }

    async exists(key: string): Promise<boolean> {
        await this._ensureRegistry();
        const path = this.registry!.byId[key]?.path;
        return path === undefined ? false : Bun.file(this._abs(path)).exists();
    }

    // ── reconciliation — self-healing pass ───────────────────────────

    /**
     * Re-link the registry to what is actually on disk. Heals files a developer
     * moved/renamed directly in their IDE (matched back to their uuid by content
     * hash), mints ids for genuinely-new files/folders, refreshes hashes after an
     * in-place edit, and drops registry entries whose file is gone. Deterministic
     * (paths + content hashes only, never mtime/inode) and idempotent. Runs on
     * every `p9r dev` boot and via `p9r files reindex`.
     */
    async reconcile(opts: ReconcileOptions = {}): Promise<ReconcileResult> {
        if (opts.force) {
            await this._resetRegistry();
        } else {
            await this._ensureRegistry();
        }
        const reg = this.registry!;
        const result: ReconcileResult = { healed: [], minted: [], deleted: [], errors: [] };

        // 1. Scan disk (sorted-path order, skip dotfiles + non-regular/non-dir).
        const folders: string[] = [];
        const files: string[] = [];
        await this._scan("", folders, files);
        folders.sort();
        files.sort();
        const fileSet = new Set(files);

        const newById: Record<string, RegistryEntry> = {};
        const newByPath: Record<string, string> = {};

        // 2. Folders: known folder path keeps its uuid; else mint.
        for (const fp of folders) {
            const existing = reg.byPath[fp];
            const uuid = existing && reg.byId[existing]?.hash === null ? existing : randomUUIDv7();
            if (uuid !== existing) {
                result.minted.push({ uuid, path: fp });
            }
            newById[uuid] = { path: fp, hash: null };
            newByPath[fp] = uuid;
        }

        // 3. Hash every on-disk file once (the recovery key + the refreshed hash).
        const diskHash = new Map<string, string>();
        for (const fp of files) {
            try {
                diskHash.set(fp, sha256Hex(await Bun.file(this._abs(fp)).bytes()));
            } catch (e) {
                result.errors.push({ path: fp, error: String(e) });
            }
        }

        // 4. Recovery index: registry FILE entries whose path no longer exists,
        //    grouped by hash, each list sorted by registered path (stable zip).
        const recovery = new Map<string, string[]>();
        for (const [uuid, e] of Object.entries(reg.byId).sort(([, a], [, b]) => a.path.localeCompare(b.path))) {
            if (e.hash !== null && !fileSet.has(e.path)) {
                (recovery.get(e.hash) ?? recovery.set(e.hash, []).get(e.hash)!).push(uuid);
            }
        }
        const consumed = new Set<string>();

        // 5. Files: refresh in place, heal a move by hash, or mint.
        for (const fp of files) {
            const h = diskHash.get(fp);
            if (h === undefined) {
                continue; // I/O error (step 3): leave for next pass
            }
            const known = reg.byPath[fp];
            if (known && reg.byId[known] !== undefined && reg.byId[known].hash !== null) {
                newById[known] = { path: fp, hash: h }; // in-place (possibly edited): keep uuid, refresh
                newByPath[fp] = known;
                continue;
            }
            const cand = (recovery.get(h) ?? []).find((u) => !consumed.has(u));
            if (cand) {
                consumed.add(cand);
                result.healed.push({ uuid: cand, from: reg.byId[cand]!.path, to: fp });
                newById[cand] = { path: fp, hash: h };
                newByPath[fp] = cand;
            } else {
                const uuid = randomUUIDv7();
                result.minted.push({ uuid, path: fp });
                newById[uuid] = { path: fp, hash: h };
                newByPath[fp] = uuid;
            }
        }

        // 6. Orphans: registry FILE entry whose path is gone and hash matched nothing.
        for (const [uuid, e] of Object.entries(reg.byId)) {
            if (e.hash !== null && !fileSet.has(e.path) && !consumed.has(uuid)) {
                result.deleted.push({ uuid, path: e.path });
            }
        }

        // 7. Commit one snapshot atomically.
        reg.byId = newById;
        reg.byPath = newByPath;
        await this._saveRegistry();
        this.dirty = false;
        return result;
    }

    // ── helpers ──────────────────────────────────────────────────────

    private _childPath(parentId: string | null, name: string): string {
        const parentPath = parentId === null ? "" : this.registry!.byId[parentId]?.path;
        if (parentPath === undefined) {
            throw new Error(`unknown parent "${parentId}"`);
        }
        return parentPath ? `${parentPath}/${name}` : name;
    }

    private async _assertFree(path: string): Promise<void> {
        if ((await Bun.file(this._abs(path)).exists()) || (await isDir(this._abs(path)))) {
            throw new Error(`"${path}" already exists in the destination folder`);
        }
    }

    /** Stat a path off disk and emit a FilesItem whose id/parentId are uuids,
     *  minting (safety-net) any path the registry hasn't seen yet. */
    private async _stat(path: string): Promise<FilesItem | null> {
        if (!path) {
            return null;
        }
        let s: Awaited<ReturnType<typeof stat>>;
        try {
            s = await stat(this._abs(path));
        } catch {
            return null;
        }
        const id = await this._resolveId(path, s.isDirectory());
        const parentPath = parentOf(path);
        const parentId = parentPath ? await this._resolveId(parentPath, true) : null;
        const base = { id, name: path.split("/").pop()!, parentId, createdAt: s.birthtime, updatedAt: s.mtime };
        if (s.isDirectory()) {
            return { ...base, type: "folder" };
        }
        const f = Bun.file(this._abs(path));
        // The registry hash IS the content hash (kept disk-accurate by put/reconcile).
        return {
            ...base,
            type: "file",
            size: s.size,
            mimeType: f.type || "application/octet-stream",
            contentHash: this.registry!.byId[id]!.hash ?? undefined,
        };
    }

    /** uuid for a path — from the registry, or minted (recording the on-disk
     *  hash for files). The mint is the safety net for a path that bypassed
     *  reconcile; in normal flow the path is already registered. */
    private async _resolveId(path: string, isDirectory: boolean): Promise<string> {
        const reg = this.registry!;
        const existing = reg.byPath[path];
        if (existing) {
            return existing;
        }
        const hash = isDirectory ? null : sha256Hex(await Bun.file(this._abs(path)).bytes());
        const uuid = randomUUIDv7();
        reg.byId[uuid] = { path, hash };
        reg.byPath[path] = uuid;
        this.dirty = true;
        return uuid;
    }

    /** Rewrite a path prefix (rename/move) across the registry, keeping uuids. */
    private _rewritePrefix(oldPath: string, newPath: string): void {
        const reg = this.registry!;
        for (const [uuid, e] of Object.entries(reg.byId)) {
            if (e.path !== oldPath && !e.path.startsWith(oldPath + "/")) {
                continue;
            }
            delete reg.byPath[e.path];
            e.path = e.path === oldPath ? newPath : newPath + e.path.slice(oldPath.length);
            reg.byPath[e.path] = uuid;
        }
        this.dirty = true;
    }

    /** Drop a path and every descendant from the registry; return file uuids. */
    private _removeSubtree(path: string): string[] {
        const reg = this.registry!;
        const removedFiles: string[] = [];
        for (const [uuid, e] of Object.entries(reg.byId)) {
            if (e.path !== path && !e.path.startsWith(path + "/")) {
                continue;
            }
            if (e.hash !== null) {
                removedFiles.push(uuid);
            }
            delete reg.byPath[e.path];
            delete reg.byId[uuid];
        }
        this.dirty = true;
        return removedFiles;
    }

    private async _scan(rel: string, folders: string[], files: string[]): Promise<void> {
        let entries;
        try {
            entries = await readdir(this._abs(rel), { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (e.name.startsWith(".")) {
                continue; // dotfiles, incl. the registry sibling if misplaced
            }
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                folders.push(childRel);
                await this._scan(childRel, folders, files);
            } else if (e.isFile()) {
                files.push(childRel); // skip symlinks / non-regular (matches push scan)
            }
        }
    }

    // ── registry persistence ─────────────────────────────────────────

    private async _resetRegistry(): Promise<void> {
        if (await Bun.file(join(this.root, CMS_FILES_REGISTRY_NAME)).exists()) {
            throw new Error(
                `${CMS_FILES_REGISTRY_NAME} must live beside files/, not inside it (move it to the site root).`,
            );
        }
        await rm(this.registryPath, { force: true });
        this.registry = { version: 1, byId: {}, byPath: {} };
        this.dirty = false;
    }

    private async _ensureRegistry(): Promise<void> {
        if (this.registry) {
            return;
        }
        // A registry found INSIDE files/ is a misplacement — it would surface as a
        // tree item and never load. Fail loudly rather than silently ignore it.
        if (await Bun.file(join(this.root, CMS_FILES_REGISTRY_NAME)).exists()) {
            throw new Error(
                `${CMS_FILES_REGISTRY_NAME} must live beside files/, not inside it (move it to the site root).`,
            );
        }
        const f = Bun.file(this.registryPath);
        if (!(await f.exists())) {
            this.registry = { version: 1, byId: {}, byPath: {} };
            return;
        }
        let parsed: { byId?: Registry["byId"]; byPath?: Registry["byPath"] };
        try {
            parsed = JSON.parse(await f.text());
        } catch {
            throw new Error(
                `Corrupt files registry at ${this.registryPath}. Restore it with ` +
                    `\`git checkout ${CMS_FILES_REGISTRY_NAME}\`, or rebuild from disk with \`p9r files reindex --force\`.`,
            );
        }
        this.registry = { version: 1, byId: parsed.byId ?? {}, byPath: parsed.byPath ?? {} };
    }

    private async _flush(): Promise<void> {
        if (!this.dirty) {
            return;
        }
        await this._saveRegistry();
        this.dirty = false;
    }

    /** Atomic write: temp file in the same dir, then rename over the target. */
    private async _saveRegistry(): Promise<void> {
        const reg = this.registry!;
        const tmp = this.registryPath + ".tmp";
        await Bun.write(tmp, JSON.stringify({ version: 1, byId: reg.byId, byPath: reg.byPath }, null, 2) + "\n");
        await rename(tmp, this.registryPath);
    }

    private _abs(path: string): string {
        const segments = path.split("/").filter(Boolean);
        if (segments.some((s) => s === "..")) {
            throw new Error(`invalid path "${path}"`);
        }
        return join(this.root, ...segments);
    }
}

const EMPTY_PAGE: FilesPage = { items: [], total: 0, page: 1, limit: 0, hasMore: false };

function normalize(id: string): string {
    return id
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("/");
}

function parentOf(path: string): string | null {
    const i = path.lastIndexOf("/");
    return i === -1 ? null : path.slice(0, i);
}

async function isDir(abs: string): Promise<boolean> {
    try {
        return (await stat(abs)).isDirectory();
    } catch {
        return false;
    }
}

function comparator(by: NonNullable<FilesListOptions["sortBy"]>, order: "asc" | "desc") {
    const dir = order === "asc" ? 1 : -1;
    return (a: FilesItem, b: FilesItem): number => {
        const av = sortKey(a, by);
        const bv = sortKey(b, by);
        if (av === bv) {
            return 0;
        }
        if (av === undefined) {
            return 1;
        }
        if (bv === undefined) {
            return -1;
        }
        return ((av as number) < (bv as number) ? -1 : 1) * dir;
    };
}

function sortKey(item: FilesItem, by: NonNullable<FilesListOptions["sortBy"]>): string | number | undefined {
    const v = (item as Record<string, unknown>)[by];
    if (v instanceof Date) {
        return v.getTime();
    }
    if (typeof v === "string" || typeof v === "number") {
        return v;
    }
    return undefined;
}

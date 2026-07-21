import type { LocalFile } from "./scan";
import type { ClassifiedFile, RemoteFile } from "./classify";

/** Remote file tree, indexed by readable path. */
export type RemoteTree = {
    filesByPath: Map<string, RemoteFile>;
    /** Folder id keyed by its readable path ("images/icons"). Mutated as we create. */
    folderIdByPath: Map<string, string>;
};

/** Wire shape of a file-tree item from `/api/files`. */
type WireItem = {
    id: string;
    name: string;
    type: "folder" | "file";
    parentId: string | null;
    size?: number;
};

export type ApplyResult = {
    pushed: { path: string; hash: string; size: number }[];
    failed: { path: string; error: string }[];
};

const auth = (token: string) => ({ "Authorization": `Bearer ${token}` });

/** Recursively list the whole remote tree into path-indexed maps. */
export async function fetchRemoteTree(adminBase: URL, token: string): Promise<RemoteTree> {
    const filesByPath = new Map<string, RemoteFile>();
    const folderIdByPath = new Map<string, string>();

    async function walk(parentId: string | null, prefix: string): Promise<void> {
        for (const it of await listChildren(adminBase, token, parentId)) {
            const path = prefix ? `${prefix}/${it.name}` : it.name;
            if (it.type === "folder") {
                folderIdByPath.set(path, it.id);
                await walk(it.id, path);
            } else {
                filesByPath.set(path, { id: it.id, size: it.size ?? 0 });
            }
        }
    }
    await walk(null, "");
    return { filesByPath, folderIdByPath };
}

async function listChildren(adminBase: URL, token: string, parentId: string | null): Promise<WireItem[]> {
    const url = new URL("api/files", adminBase);
    if (parentId) {
        url.searchParams.set("parentId", parentId);
    }
    const res = await fetch(url.href, { headers: auth(token) });
    if (!res.ok) {
        throw new Error(`GET ${url.href} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as { items?: WireItem[] };
    if (!Array.isArray(data.items)) {
        throw new Error(`GET ${url.href} did not return { items }`);
    }
    return data.items;
}

/**
 * Push every "new"/"update" entry: ensure its parent folders exist, then upload
 * the bytes carrying the dev registry uuid as the `id`. The upload UPSERTS on a
 * supplied id, so an update overwrites the existing row in place — we do NOT
 * delete-then-reupload, which would change the `_id` and 404 the by-id URL during
 * the window.
 */
export async function applyPushFiles(
    adminBase: URL,
    token: string,
    entries: ClassifiedFile[],
    tree: RemoteTree,
): Promise<ApplyResult> {
    const result: ApplyResult = { pushed: [], failed: [] };
    const writes = entries.filter((e) => e.status === "new" || e.status === "update");

    for (const e of writes) {
        const { file } = e;
        try {
            const parentId = await ensureFolder(adminBase, token, file.dir, tree.folderIdByPath);
            await uploadOne(adminBase, token, file, parentId);
            result.pushed.push({ path: file.path, hash: file.hash, size: file.size });
        } catch (err) {
            result.failed.push({ path: file.path, error: msg(err) });
        }
    }
    return result;
}

/** Ensure each segment of `dir` exists, creating missing folders. Returns the leaf id. */
async function ensureFolder(
    adminBase: URL,
    token: string,
    dir: string,
    folderIdByPath: Map<string, string>,
): Promise<string | null> {
    if (!dir) {
        return null;
    }
    let parentId: string | null = null;
    let cur = "";
    for (const seg of dir.split("/")) {
        cur = cur ? `${cur}/${seg}` : seg;
        let id = folderIdByPath.get(cur);
        if (!id) {
            id = await createFolder(adminBase, token, seg, parentId);
            folderIdByPath.set(cur, id);
        }
        parentId = id;
    }
    return parentId;
}

async function createFolder(adminBase: URL, token: string, name: string, parentId: string | null): Promise<string> {
    const url = new URL("api/files/folder", adminBase).href;
    const res = await fetch(url, {
        method: "POST",
        headers: { ...auth(token), "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
    });
    if (!res.ok) {
        throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
    }
    const item = (await res.json()) as { id: string };
    return item.id;
}

async function uploadOne(adminBase: URL, token: string, file: LocalFile, parentId: string | null): Promise<void> {
    const url = new URL("api/files/upload", adminBase).href;
    const form = new FormData();
    // Stream the bytes; pass the basename explicitly so the multipart filename
    // isn't the absolute path.
    form.append("file", Bun.file(file.abs), file.name);
    if (parentId) {
        form.append("parentId", parentId);
    }
    // Carry the dev registry uuid so the remote adopts it as the _id (upsert).
    if (file.id) {
        form.append("id", file.id);
    }
    // No Content-Type header — fetch sets the multipart boundary itself.
    const res = await fetch(url, { method: "POST", headers: auth(token), body: form });
    if (!res.ok) {
        throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
    }
}

async function tail(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    return text ? ` — ${text}` : "";
}

function msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

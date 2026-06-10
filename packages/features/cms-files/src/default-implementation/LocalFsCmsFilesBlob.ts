import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { BlobInput, CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";

/**
 * Local-filesystem `CmsFilesBlobStore`: one flat file per key under `root`
 * (`<root>/<id>`). Scope a per-tenant `root` at the composition root for
 * multi-tenant isolation. Server-only (uses `node:fs` + Bun's file APIs).
 */
export class LocalFsCmsFilesBlob implements CmsFilesBlobStore {

    constructor(private readonly root: string) {}

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        await mkdir(this.root, { recursive: true });
        const size = await Bun.write(this._path(key), new Response(data as BodyInit));
        return { size };
    }

    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
        const file = Bun.file(this._path(key));
        return (await file.exists()) ? file.stream() : null;
    }

    async delete(key: string): Promise<void> {
        await unlink(this._path(key)).catch(() => {}); // idempotent
    }

    async exists(key: string): Promise<boolean> {
        return Bun.file(this._path(key)).exists();
    }

    /** Keys are opaque file ids; reject anything that could escape `root`. */
    private _path(key: string): string {
        if (!key || key.includes("/") || key.includes("\\") || key.includes("..")) {
            throw new Error(`invalid blob key "${key}"`);
        }
        return join(this.root, key);
    }
}

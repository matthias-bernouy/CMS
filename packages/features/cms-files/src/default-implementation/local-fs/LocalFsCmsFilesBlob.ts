import { mkdir, rename, unlink } from "node:fs/promises";
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
        const temporary = join(this.root, `.pending-${crypto.randomUUID()}`);
        try {
            const size = await Bun.write(temporary, new Response(data as BodyInit));
            await rename(temporary, this._path(key));
            return { size };
        } finally {
            await unlink(temporary).catch(() => {});
        }
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

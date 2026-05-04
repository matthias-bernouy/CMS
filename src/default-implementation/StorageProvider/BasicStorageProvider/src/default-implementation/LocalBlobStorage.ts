import { mkdir, rm, unlink, symlink, lstat, rmdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import type { BlobStorage, BlobWriteResult } from "../interfaces/BlobStorage";

/**
 * BlobStorage backed by the local filesystem. A bucket maps to a directory
 * under `root`. The blob itself is flat — `<bucket-id>/<file-id>.<ext>` —
 * which keeps `id` ↔ blob mapping O(1). Public paths (`publicPath`) are
 * served as relative symlinks pointing to the underlying blob, so Nginx
 * `try_files` resolves them naturally and a slug rename never moves bytes
 * on disk.
 */
export class LocalBlobStorage implements BlobStorage {

    private readonly _root: string;

    constructor(root: string) {
        this._root = root;
    }

    async createBucket(bucketId: string): Promise<void> {
        await mkdir(this._bucketPath(bucketId), { recursive: true });
    }

    async deleteBucket(bucketId: string): Promise<void> {
        await rm(this._bucketPath(bucketId), { recursive: true, force: true });
    }

    async exists(bucketId: string, key: string): Promise<boolean> {
        return existsSync(this._keyPath(bucketId, key));
    }

    /**
     * Streams `body` to disk while computing SHA-256 and the byte count in one pass.
     * The chunk loop tees each frame to both the disk writer and the hasher,
     * so the file is never buffered in memory and never read twice.
     */
    async write(bucketId: string, key: string, body: ReadableStream<Uint8Array>): Promise<BlobWriteResult> {
        await mkdir(this._bucketPath(bucketId), { recursive: true });
        const path   = this._keyPath(bucketId, key);
        const writer = Bun.file(path).writer();
        const hasher = new Bun.CryptoHasher("sha256");

        let size = 0;
        const reader = body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                hasher.update(value);
                writer.write(value);
            }
            await writer.flush();
        } finally {
            await writer.end();
            reader.releaseLock();
        }

        return { size, sha256: hasher.digest("hex") };
    }

    async read(bucketId: string, key: string): Promise<ReadableStream<Uint8Array> | null> {
        const path = this._keyPath(bucketId, key);
        if (!existsSync(path)) return null;
        return Bun.file(path).stream();
    }

    async delete(bucketId: string, key: string): Promise<void> {
        const path = this._keyPath(bucketId, key);
        if (existsSync(path)) await unlink(path);
    }

    async setPublicPath(bucketId: string, publicPath: string, key: string): Promise<void> {
        const linkPath  = this._publicPath(bucketId, publicPath);
        const targetAbs = this._keyPath(bucketId, key);
        // Relative target so the bucket dir stays movable.
        const targetRel = relative(dirname(linkPath), targetAbs);

        await mkdir(dirname(linkPath), { recursive: true });
        await this._removeIfExists(linkPath);
        await symlink(targetRel, linkPath);
    }

    async clearPublicPath(bucketId: string, publicPath: string): Promise<void> {
        const linkPath = this._publicPath(bucketId, publicPath);
        await this._removeIfExists(linkPath);
        // Best-effort cleanup of now-empty parent dirs up to (but not including) the bucket root.
        await this._pruneEmptyDirs(dirname(linkPath), this._bucketPath(bucketId));
    }

    private async _removeIfExists(path: string): Promise<void> {
        try {
            await lstat(path);
        } catch {
            return; // not present
        }
        await unlink(path);
    }

    private async _pruneEmptyDirs(start: string, stopAt: string): Promise<void> {
        let cur = start;
        while (cur.length > stopAt.length && cur.startsWith(stopAt)) {
            try {
                await rmdir(cur); // throws ENOTEMPTY when there's still content
            } catch {
                return;
            }
            cur = dirname(cur);
        }
    }

    private _bucketPath(bucketId: string): string {
        return join(this._root, bucketId);
    }

    private _keyPath(bucketId: string, key: string): string {
        return join(this._bucketPath(bucketId), key);
    }

    private _publicPath(bucketId: string, publicPath: string): string {
        return join(this._bucketPath(bucketId), publicPath);
    }
}

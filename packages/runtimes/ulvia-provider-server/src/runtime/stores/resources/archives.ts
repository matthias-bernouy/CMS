import { mkdir, opendir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import { sha256Digest } from "@bernouy/binary-media";
import type { ResourceInitializationRetainer } from "@bernouy/resources/initialization";
import { captureResourceBytes } from "./binary";

const writers = new Set<string>();
const MAX_ARCHIVES = 2;
const MAX_BYTES = 64 * 1024 * 1024;

/** Private per-instance host storage. A host owns its filesystem root; compositions share a writer guard. */
export class PrivateResourceArchives implements ResourceInitializationRetainer {
    private readonly blobs: LocalFsBlobStore;
    constructor(private readonly root: string) {
        this.blobs = new LocalFsBlobStore(root);
    }
    private key(digest: string) {
        if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) {
            throw new TypeError("Invalid resource review digest");
        }
        return digest.slice(7) + ".zip";
    }
    async put(digest: string, input: Blob): Promise<void> {
        const key = this.key(digest);
        if (writers.has(this.root)) {
            throw Object.assign(new Error("Resource archive retention is busy"), { status: 423 });
        }
        writers.add(this.root);
        try {
            const bytes = await captureResourceBytes(input);
            await mkdir(this.root, { recursive: true, mode: 0o700 });
            const existing = await this.get(digest);
            if (existing) {
                if ((await sha256Digest(await captureResourceBytes(existing))) !== (await sha256Digest(bytes))) {
                    throw Object.assign(new Error("Retained resource archive conflicts with its review"), {
                        status: 409,
                    });
                }
                return;
            }
            const directory = await opendir(this.root);
            let count = 0;
            for await (const entry of directory) {
                if (!entry.isFile() || ++count >= MAX_ARCHIVES) {
                    throw Object.assign(new Error("Resource archive retention budget exceeded"), { status: 423 });
                }
            }
            // LocalFsBlobStore commits by rename. At most two retained files plus one bounded temporary exist.
            await this.blobs.put(key, bytes);
        } finally {
            writers.delete(this.root);
        }
    }
    async get(digest: string): Promise<Blob | null> {
        const file = Bun.file(join(this.root, this.key(digest)));
        if (!(await file.exists())) {
            return null;
        }
        if (file.size > MAX_BYTES) {
            throw new RangeError("Retained resource archive exceeds its byte limit");
        }
        // The worker observes the stream under the same limit and verifies the reviewed archive SHA.
        return file;
    }
    async remove(digest: string): Promise<void> {
        await unlink(join(this.root, this.key(digest))).catch((error: unknown) => {
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
                throw error;
            }
        });
    }
}

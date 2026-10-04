import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    assertBlobKey,
    assertBlobRange,
    type BlobInput,
    type BlobReadOptions,
    type BlobStore,
} from "blob-store/core/contracts";

export class LocalFsBlobStore implements BlobStore {
    constructor(private readonly root: string) {}

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        const destination = this.path(key);
        await mkdir(dirname(destination), { recursive: true });
        const temporary = join(this.root, `.pending-${crypto.randomUUID()}`);
        try {
            const size = await Bun.write(temporary, new Response(data as BodyInit));
            await rename(temporary, destination);
            return { size };
        } finally {
            await unlink(temporary).catch(() => {});
        }
    }

    async get(key: string, options: BlobReadOptions = {}): Promise<ReadableStream<Uint8Array> | null> {
        const file = Bun.file(this.path(key));
        if (!(await file.exists())) {
            return null;
        }
        if (!options.range) {
            return file.stream();
        }
        assertBlobRange(options.range, file.size);
        return file.slice(options.range.start, options.range.end + 1).stream();
    }

    async head(key: string): Promise<{ size: number } | null> {
        const file = Bun.file(this.path(key));
        return (await file.exists()) ? { size: file.size } : null;
    }

    async delete(key: string): Promise<void> {
        await unlink(this.path(key)).catch(() => {});
    }

    async exists(key: string): Promise<boolean> {
        return (await this.head(key)) !== null;
    }

    private path(key: string): string {
        assertBlobKey(key);
        return join(this.root, ...key.split("/"));
    }
}

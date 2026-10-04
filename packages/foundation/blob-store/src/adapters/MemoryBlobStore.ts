import {
    assertBlobKey,
    assertBlobRange,
    type BlobInput,
    type BlobReadOptions,
    type BlobStore,
} from "blob-store/core/contracts";

export class MemoryBlobStore implements BlobStore {
    private readonly blobs = new Map<string, Uint8Array>();

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        assertBlobKey(key);
        const bytes = new Uint8Array(await new Response(data as BodyInit).arrayBuffer());
        this.blobs.set(key, bytes);
        return { size: bytes.byteLength };
    }

    async get(key: string, options: BlobReadOptions = {}): Promise<ReadableStream<Uint8Array> | null> {
        assertBlobKey(key);
        const stored = this.blobs.get(key);
        if (!stored) {
            return null;
        }
        const bytes = options.range
            ? (assertBlobRange(options.range, stored.byteLength),
              stored.slice(options.range.start, options.range.end + 1))
            : stored.slice();
        return new ReadableStream({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            },
        });
    }

    async head(key: string): Promise<{ size: number } | null> {
        assertBlobKey(key);
        const bytes = this.blobs.get(key);
        return bytes ? { size: bytes.byteLength } : null;
    }

    async delete(key: string): Promise<void> {
        assertBlobKey(key);
        this.blobs.delete(key);
    }

    async exists(key: string): Promise<boolean> {
        return (await this.head(key)) !== null;
    }
}

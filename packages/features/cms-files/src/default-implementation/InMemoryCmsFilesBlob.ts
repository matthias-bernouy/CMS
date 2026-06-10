import type { BlobInput, CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";

/**
 * In-memory `CmsFilesBlobStore` for dev and tests. Bytes live in a Map keyed by
 * the file id; no persistence. Mirrors `LocalFsCmsFilesBlob` semantics.
 */
export class InMemoryCmsFilesBlob implements CmsFilesBlobStore {

    private _blobs = new Map<string, Uint8Array>();

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        const bytes = new Uint8Array(await new Response(data as BodyInit).arrayBuffer());
        this._blobs.set(key, bytes);
        return { size: bytes.byteLength };
    }

    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
        const bytes = this._blobs.get(key);
        if (bytes === undefined) return null;
        return new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(bytes); controller.close(); },
        });
    }

    async delete(key: string): Promise<void> {
        this._blobs.delete(key);
    }

    async exists(key: string): Promise<boolean> {
        return this._blobs.has(key);
    }
}

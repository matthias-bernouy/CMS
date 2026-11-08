import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import type { BlobInput } from "@bernouy/blob-store";
import { sha256Digest } from "@bernouy/binary-media";
import { MemoryResourceMetadataStore } from "../../src/exports/memory";
import { ResourceAssets } from "../../src/exports/storage";

class CountedBlobs extends MemoryBlobStore {
    readonly writes: string[] = [];
    override async put(key: string, data: BlobInput) {
        this.writes.push(key);
        return super.put(key, data);
    }
}
async function fixture() {
    const bytes = new TextEncoder().encode("payload");
    return {
        bytes,
        asset: {
            namespace: "acme/base",
            id: "file.txt",
            mediaType: "text/plain",
            byteLength: bytes.length,
            digest: await sha256Digest(bytes),
        },
    };
}

test("ordinary assets retain verified bytes, support exact retry and ranges, and need no archive", async () => {
    const metadata = new MemoryResourceMetadataStore("instance-a:default");
    const blobs = new CountedBlobs();
    const store = new ResourceAssets(metadata, blobs);
    const { asset, bytes } = await fixture();
    expect(await metadata.isEmpty()).toBe(true);
    const pending = store.putExact(asset, bytes);
    bytes.fill(0);
    await pending;
    await store.putExact(asset, new TextEncoder().encode("payload"));
    expect(blobs.writes).toHaveLength(1);
    const ref = { namespace: asset.namespace, id: asset.id };
    expect(await new Response((await store.read(ref))!.stream).text()).toBe("payload");
    expect(await new Response((await store.read(ref, { start: 1, end: 3 }))!.stream).text()).toBe("ayl");
    await expect(store.read(ref, { start: 0, end: 7 })).rejects.toBeInstanceOf(RangeError);
    expect(await metadata.isEmpty()).toBe(false);
});

test("invalid bytes, conflicting metadata and cancellation leave asset metadata and blobs unchanged", async () => {
    const metadata = new MemoryResourceMetadataStore("instance-a:default");
    const blobs = new CountedBlobs();
    const store = new ResourceAssets(metadata, blobs);
    const { asset, bytes } = await fixture();
    await expect(store.putExact({ ...asset, digest: `sha256:${"0".repeat(64)}` }, bytes)).rejects.toThrow("digest");
    await expect(store.putExact({ ...asset, mediaType: "image/png" }, bytes)).rejects.toThrow("signature");
    const controller = new AbortController();
    controller.abort();
    await expect(store.putExact(asset, bytes, controller.signal)).rejects.toBeInstanceOf(Error);
    expect(await metadata.isEmpty()).toBe(true);
    expect(blobs.writes).toHaveLength(0);
    await store.putExact(asset, bytes);
    await expect(store.putExact({ ...asset, mediaType: "application/octet-stream" }, bytes)).rejects.toThrow(
        "already exists",
    );
    expect(blobs.writes).toHaveLength(1);
});

test("shared blob storage cannot resolve another instance's resource payload or repair missing own bytes", async () => {
    const blobs = new CountedBlobs();
    const aMetadata = new MemoryResourceMetadataStore("instance-a:default");
    const bMetadata = new MemoryResourceMetadataStore("instance-b:default");
    const a = new ResourceAssets(aMetadata, blobs);
    const b = new ResourceAssets(bMetadata, blobs);
    const { asset, bytes } = await fixture();
    const ref = { namespace: asset.namespace, id: asset.id };
    await a.putExact(asset, bytes);
    expect(await b.read(ref)).toBeNull();
    await bMetadata.createAsset(asset);
    await expect(b.read(ref)).rejects.toThrow("missing or inconsistent");
    await blobs.delete(blobs.writes[0]!);
    await expect(a.putExact(asset, bytes)).rejects.toThrow("missing or inconsistent");
    expect(blobs.writes).toHaveLength(1);
});

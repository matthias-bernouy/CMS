import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import type { BlobReadOptions } from "@bernouy/blob-store";
import { sha256Digest } from "@bernouy/binary-media";
import { MemoryResourceMetadataStore } from "../../../src/exports/memory";
import { ResourceAssets } from "../../../src/exports/storage";
import { resourceAssetUrl, serveResourceAsset } from "../../../src/exports/delivery";

export class CountedBlobs extends MemoryBlobStore {
    heads = 0;
    reads: (BlobReadOptions | undefined)[] = [];
    override async head(key: string) {
        this.heads++;
        return super.head(key);
    }
    override async get(key: string, options?: BlobReadOptions) {
        this.reads.push(options);
        return super.get(key, options);
    }
}
export class CountedMetadata extends MemoryResourceMetadataStore {
    reads = 0;
    loaded = 0;
    override async readAssets(input: Parameters<MemoryResourceMetadataStore["readAssets"]>[0]) {
        this.reads++;
        const rows = await super.readAssets(input);
        this.loaded += rows.length;
        return rows;
    }
}
export async function fixture(content = "payload", svg = false, profile = svg) {
    const bytes = new TextEncoder().encode(content);
    const metadata = new CountedMetadata("instance-a:default");
    const blobs = new CountedBlobs();
    const assets = new ResourceAssets(metadata, blobs);
    const asset = {
        namespace: "acme/base",
        id: svg ? "icons/check.svg" : "files/test.txt",
        mediaType: svg ? "image/svg+xml" : "text/plain",
        byteLength: bytes.length,
        digest: await sha256Digest(bytes),
        ...(profile ? { profiles: ["inline-svg"] as ["inline-svg"] } : {}),
    };
    await assets.putExact(asset, bytes);
    metadata.reads = metadata.loaded = blobs.heads = 0;
    return {
        assets,
        asset,
        metadata,
        blobs,
        url: resourceAssetUrl(asset),
        read: (options: RequestInit = {}, path = resourceAssetUrl(asset)) =>
            serveResourceAsset(new Request("https://site.test" + path, options), assets),
    };
}

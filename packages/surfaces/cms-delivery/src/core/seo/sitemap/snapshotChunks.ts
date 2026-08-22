import { CryptoHasher, gzipSync } from "bun";
import type { CmsFilesBlobStore } from "@bernouy/cms-files";
import { isDeliveryReservedPath } from "cms-delivery/core/pages/publicPagePaths";
import type { PageIndexingLocation } from "cms-delivery/core/seo/discoverPageIndexingLocations";
import { sitemapChunkKey, type SitemapChunkDescriptor, type SitemapSnapshotDescriptor } from "./manifest";
import {
    MAX_SITEMAP_UNCOMPRESSED_BYTES,
    MAX_SITEMAP_URLS_PER_CHUNK,
    sitemapUrlXml,
    URLSET_FOOTER,
    URLSET_HEADER,
} from "./xml";

const MAX_SITEMAP_CHUNKS = 50_000;
const ENCODER = new TextEncoder();

export class SitemapChunkWriter {
    private readonly snapshotId = crypto.randomUUID();
    private readonly chunks: SitemapChunkDescriptor[] = [];
    private readonly seen = new Set<string>();
    private lines: string[] = [];
    private byteCount = fixedByteCount();

    constructor(
        private readonly store: CmsFilesBlobStore,
        private readonly publicBaseUrl: string,
        private readonly signal?: AbortSignal,
    ) {}

    async append(entry: PageIndexingLocation, cmsPathPrefix: string): Promise<void> {
        this.signal?.throwIfAborted();
        const pathname = entry.location.split("?", 1)[0]!;
        if (this.seen.has(entry.location) || isDeliveryReservedPath(pathname, cmsPathPrefix)) {
            return;
        }
        const line = sitemapUrlXml(this.publicBaseUrl, entry);
        const lineBytes = ENCODER.encode(`${line}\n`).byteLength;
        if (
            this.lines.length > 0 &&
            (this.lines.length >= MAX_SITEMAP_URLS_PER_CHUNK ||
                this.byteCount + lineBytes > MAX_SITEMAP_UNCOMPRESSED_BYTES)
        ) {
            await this.flush();
        }
        this.seen.add(entry.location);
        this.lines.push(line);
        this.byteCount += lineBytes;
    }

    async finish(): Promise<SitemapSnapshotDescriptor> {
        if (this.lines.length > 0 || this.chunks.length === 0) {
            await this.flush();
        }
        return {
            id: this.snapshotId,
            generatedAt: new Date().toISOString(),
            publicBaseUrl: this.publicBaseUrl,
            chunks: this.chunks,
        };
    }

    async rollback(): Promise<void> {
        await deleteSitemapSnapshot(this.store, { id: this.snapshotId, chunks: this.chunks });
    }

    private async flush(): Promise<void> {
        if (this.chunks.length >= MAX_SITEMAP_CHUNKS) {
            throw new RangeError("sitemap chunk limit exceeded");
        }
        this.signal?.throwIfAborted();
        const raw = ENCODER.encode([URLSET_HEADER, ...this.lines, URLSET_FOOTER].join("\n"));
        if (raw.byteLength > MAX_SITEMAP_UNCOMPRESSED_BYTES) {
            throw new RangeError("sitemap uncompressed byte limit exceeded");
        }
        const compressed = new Uint8Array(gzipSync(raw));
        const index = this.chunks.length + 1;
        const hash = new CryptoHasher("sha256").update(compressed).digest("hex");
        const stored = await this.store.put(sitemapChunkKey(this.snapshotId, index), compressed);
        this.chunks.push({ index, urlCount: this.lines.length, compressedBytes: stored.size, hash });
        this.lines = [];
        this.byteCount = fixedByteCount();
    }
}

export async function deleteSitemapSnapshot(
    store: CmsFilesBlobStore,
    snapshot: Pick<SitemapSnapshotDescriptor, "id" | "chunks">,
): Promise<void> {
    await Promise.all(snapshot.chunks.map(({ index }) => store.delete(sitemapChunkKey(snapshot.id, index))));
}

function fixedByteCount(): number {
    return ENCODER.encode(`${URLSET_HEADER}\n${URLSET_FOOTER}`).byteLength;
}

import { CryptoHasher, gzipSync } from "bun";
import type { SitemapStore } from "@bernouy/cms-content/files/serving";
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
const TARGET_SITEMAP_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;
const ENCODER = new TextEncoder();

type GroupBuffer = { language: string | null; lines: string[]; byteCount: number };

export class SitemapChunkWriter {
    private readonly snapshotId = crypto.randomUUID();
    private readonly chunks: SitemapChunkDescriptor[] = [];
    private readonly seen = new Set<string>();
    private readonly groups = new Map<string | null, GroupBuffer>();

    constructor(
        private readonly store: Pick<SitemapStore, "put" | "delete">,
        private readonly publicBaseUrl: string,
        private readonly signal?: AbortSignal,
    ) {}

    async append(entry: PageIndexingLocation, cmsPathPrefix: string): Promise<void> {
        this.signal?.throwIfAborted();
        const pathname = entry.location.split("?", 1)[0]!;
        if (this.seen.has(entry.location) || isDeliveryReservedPath(pathname, cmsPathPrefix)) {
            return;
        }
        const language = entry.language ?? null;
        const group = this.groups.get(language) ?? { language, lines: [], byteCount: fixedByteCount() };
        this.groups.set(language, group);
        const line = sitemapUrlXml(this.publicBaseUrl, entry);
        const lineBytes = ENCODER.encode(`${line}\n`).byteLength;
        if (
            group.lines.length > 0 &&
            (group.lines.length >= MAX_SITEMAP_URLS_PER_CHUNK ||
                group.byteCount + lineBytes > TARGET_SITEMAP_UNCOMPRESSED_BYTES)
        ) {
            await this.flush(group);
        }
        this.seen.add(entry.location);
        group.lines.push(line);
        group.byteCount += lineBytes;
    }

    async finish(): Promise<SitemapSnapshotDescriptor> {
        for (const group of this.groups.values()) {
            if (group.lines.length > 0) {
                await this.flush(group);
            }
        }
        if (this.chunks.length === 0) {
            await this.flush({ language: null, lines: [], byteCount: fixedByteCount() });
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

    private async flush(group: GroupBuffer): Promise<void> {
        if (this.chunks.length >= MAX_SITEMAP_CHUNKS) {
            throw new RangeError("sitemap chunk limit exceeded");
        }
        this.signal?.throwIfAborted();
        const raw = ENCODER.encode([URLSET_HEADER, ...group.lines, URLSET_FOOTER].join("\n"));
        if (raw.byteLength > MAX_SITEMAP_UNCOMPRESSED_BYTES) {
            throw new RangeError("sitemap uncompressed byte limit exceeded");
        }
        const compressed = new Uint8Array(gzipSync(raw));
        const index = this.chunks.length + 1;
        const hash = new CryptoHasher("sha256").update(compressed).digest("hex");
        const stored = await this.store.put(sitemapChunkKey(this.snapshotId, index), compressed);
        this.chunks.push({
            index,
            language: group.language,
            urlCount: group.lines.length,
            compressedBytes: stored.size,
            hash,
        });
        group.lines = [];
        group.byteCount = fixedByteCount();
    }
}

export async function deleteSitemapSnapshot(
    store: Pick<SitemapStore, "delete">,
    snapshot: Pick<SitemapSnapshotDescriptor, "id" | "chunks">,
): Promise<void> {
    await Promise.all(snapshot.chunks.map(({ index }) => store.delete(sitemapChunkKey(snapshot.id, index))));
}

function fixedByteCount(): number {
    return ENCODER.encode(`${URLSET_HEADER}\n${URLSET_FOOTER}`).byteLength;
}

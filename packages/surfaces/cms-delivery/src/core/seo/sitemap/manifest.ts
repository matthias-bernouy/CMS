import type { CmsFilesBlobStore } from "@bernouy/cms-files";

export const SITEMAP_MANIFEST_KEY = "manifest.json";
export const SITEMAP_CHUNKS_ROUTE = "/sitemaps";
export const SITEMAP_RETAINED_SNAPSHOTS = 5;

export type SitemapChunkDescriptor = {
    index: number;
    urlCount: number;
    compressedBytes: number;
    hash: string;
};

export type SitemapSnapshotDescriptor = {
    id: string;
    generatedAt: string;
    publicBaseUrl: string;
    chunks: SitemapChunkDescriptor[];
};

export type SitemapManifest = {
    version: 1;
    snapshots: SitemapSnapshotDescriptor[];
};

export function sitemapChunkKey(snapshotId: string, index: number): string {
    return `${snapshotId}-${String(index).padStart(5, "0")}.xml.gz`;
}

export function sitemapChunkPath(snapshotId: string, index: number): string {
    return `${SITEMAP_CHUNKS_ROUTE}/${encodeURIComponent(snapshotId)}/${index}.xml.gz`;
}

export async function readSitemapManifest(store: CmsFilesBlobStore): Promise<SitemapManifest | null> {
    const stream = await store.get(SITEMAP_MANIFEST_KEY);
    if (!stream) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = await new Response(stream).json();
    } catch {
        throw new TypeError("stored sitemap manifest is invalid JSON");
    }
    if (!isSitemapManifest(parsed)) {
        throw new TypeError("stored sitemap manifest is invalid");
    }
    return parsed;
}

function isSitemapManifest(value: unknown): value is SitemapManifest {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.snapshots)) {
        return false;
    }
    return value.snapshots.length <= SITEMAP_RETAINED_SNAPSHOTS && value.snapshots.every(isSnapshot);
}

function isSnapshot(value: unknown): value is SitemapSnapshotDescriptor {
    if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/u.test(value.id) ||
        typeof value.generatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.generatedAt)) ||
        typeof value.publicBaseUrl !== "string" ||
        !isHttpBaseUrl(value.publicBaseUrl) ||
        !Array.isArray(value.chunks) ||
        value.chunks.length === 0 ||
        value.chunks.length > 50_000
    ) {
        return false;
    }
    return value.chunks.every((chunk, position) => isChunk(chunk, position + 1));
}

function isChunk(value: unknown, expectedIndex: number): value is SitemapChunkDescriptor {
    return (
        isRecord(value) &&
        value.index === expectedIndex &&
        Number.isSafeInteger(value.urlCount) &&
        (value.urlCount as number) >= 0 &&
        (value.urlCount as number) <= 50_000 &&
        Number.isSafeInteger(value.compressedBytes) &&
        (value.compressedBytes as number) > 0 &&
        typeof value.hash === "string" &&
        /^[a-f0-9]{64}$/u.test(value.hash)
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpBaseUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            !value.endsWith("/")
        );
    } catch {
        return false;
    }
}

import type { BlobStore } from "@bernouy/blob-store";
import { matchRootSitemapChunkPath, readSitemapManifest, sitemapChunkKey } from "cms-seo/sitemap/manifest";
import type { Logger } from "@bernouy/logging";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function createSitemapChunkHandler(config: { store?: BlobStore; basePath: string; logger: Logger }) {
    return async (request: Request): Promise<Response> => {
        if (!config.store) {
            return new Response("Not Found", { status: 404 });
        }
        try {
            const path = new URL(request.url).pathname.slice(config.basePath.length);
            const route = matchRootSitemapChunkPath(path);
            if (!route) {
                return new Response("Not Found", { status: 404 });
            }
            const manifest = await readSitemapManifest(config.store);
            const snapshot = manifest?.snapshots.find(({ id }) => id === route.snapshotId);
            const chunk = snapshot?.chunks[route.index - 1];
            if (!chunk || chunk.index !== route.index || chunk.language !== route.language) {
                return new Response("Not Found", { status: 404 });
            }
            const etag = `"${chunk.hash}"`;
            if (request.headers.get("if-none-match") === etag) {
                return new Response(null, {
                    status: 304,
                    headers: { "cache-control": IMMUTABLE_CACHE_CONTROL, etag },
                });
            }
            const body = await config.store.get(sitemapChunkKey(snapshot.id, route.index));
            if (!body) {
                return new Response("Service Unavailable", {
                    status: 503,
                    headers: { "cache-control": "no-store" },
                });
            }
            return new Response(body, {
                headers: {
                    "cache-control": IMMUTABLE_CACHE_CONTROL,
                    "content-length": String(chunk.compressedBytes),
                    "content-type": "application/gzip",
                    etag,
                },
            });
        } catch (error) {
            config.logger.error("seo.sitemap-chunk.failed", {}, error);
            return new Response("Internal Server Error", {
                status: 500,
                headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
            });
        }
    };
}

import type DeliveryCms from "cms-delivery/DeliveryCms";
import {
    matchRootSitemapChunkPath,
    readSitemapManifest,
    sitemapChunkKey,
} from "cms-delivery/core/seo/sitemap/manifest";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export default async function SitemapChunkServer(request: Request, delivery: DeliveryCms): Promise<Response> {
    const store = delivery.sitemapStoreOrNull;
    if (!store) {
        return new Response("Not Found", { status: 404 });
    }
    try {
        const url = new URL(request.url);
        const route = matchRootSitemapChunkPath(url.pathname.slice(delivery.basePath.length));
        if (!route) {
            return new Response("Not Found", { status: 404 });
        }
        const manifest = await readSitemapManifest(store);
        const snapshot = manifest?.snapshots.find(({ id }) => id === route.snapshotId);
        const index = route.index;
        const chunk = snapshot?.chunks[index - 1];
        if (!chunk || chunk.index !== index || chunk.language !== route.language) {
            return new Response("Not Found", { status: 404 });
        }
        const etag = `"${chunk.hash}"`;
        if (request.headers.get("if-none-match") === etag) {
            return new Response(null, {
                status: 304,
                headers: { "cache-control": IMMUTABLE_CACHE_CONTROL, etag },
            });
        }
        const body = await store.get(sitemapChunkKey(snapshot.id, index));
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
        console.error("Delivery sitemap chunk failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return new Response("Internal Server Error", {
            status: 500,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
}

import type DeliveryCms from "cms-delivery/DeliveryCms";
import { readSitemapManifest, SITEMAP_CHUNKS_ROUTE, sitemapChunkKey } from "cms-delivery/core/seo/sitemap/manifest";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export default async function SitemapChunkServer(request: Request, delivery: DeliveryCms): Promise<Response> {
    const store = delivery.sitemapStoreOrNull;
    if (!store) {
        return new Response("Not Found", { status: 404 });
    }
    try {
        const route = `${delivery.basePath}${SITEMAP_CHUNKS_ROUTE}/`;
        const pathname = new URL(request.url).pathname;
        if (!pathname.startsWith(route)) {
            return new Response("Not Found", { status: 404 });
        }
        const match = /^([a-zA-Z0-9_-]{1,100})\/([1-9]\d*)\.xml\.gz$/u.exec(pathname.slice(route.length));
        if (!match) {
            return new Response("Not Found", { status: 404 });
        }
        const manifest = await readSitemapManifest(store);
        const snapshot = manifest?.snapshots.find(({ id }) => id === match[1]);
        const index = Number(match[2]);
        const chunk = snapshot?.chunks[index - 1];
        if (!chunk || chunk.index !== index) {
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

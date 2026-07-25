import type { ImagePerformanceAdapter } from "../core/adapter";
import type { LoadedCorpus } from "../core/corpus";

export type ListingServer = {
    origin: string;
    stop(): void;
};

export function startListingServer(corpus: LoadedCorpus, adapter: ImagePerformanceAdapter): ListingServer {
    const assets = new Map(corpus.assets.map((asset) => [asset.assetId, asset]));
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/foreground") {
                return adapter.foreground(request);
            }
            const match = /^\/image\/(asset-\d+)$/.exec(url.pathname);
            const asset = match ? assets.get(match[1]!) : undefined;
            if (!asset) {
                return new Response("Not found", { status: 404 });
            }
            return adapter.respond(asset, request);
        },
    });
    return {
        origin: server.url.origin,
        stop() {
            server.stop(true);
        },
    };
}

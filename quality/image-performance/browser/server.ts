import { createAdapter } from "../core/adapter";
import type { LoadedAsset } from "../core/corpus";
import { syntheticPng } from "../core/png";
import type { BrowserPerformanceProvenance } from "./contracts";
import { buildCurrentBrowserComponent } from "./componentBuild";

function fixtureHtml(): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html, body { margin: 0; width: 100%; }
.row { display: block; width: 100%; }
.frame { aspect-ratio: 4 / 3; }
.narrow { width: 30%; }
.wide { width: 100%; }
img { display: block; width: 100%; height: 100%; object-fit: cover; }
.probes { display: none; }
</style>
</head>
<body>
<div class="row"><div class="frame narrow"><img data-slot="narrow" alt=""></div></div>
<div class="row"><div class="frame wide"><img data-slot="wide" alt=""></div></div>
<div class="probes" aria-hidden="true">
<img data-probe="empty" alt="">
<img data-probe="unresolved-source" alt="">
<img data-probe="unresolved-width" alt="">
<img data-probe="unresolved-height" alt="">
<img data-probe="unresolved-sizes" alt="">
</div>
<script src="/component.js"></script>
<script type="module" src="/fixture.js"></script>
</body>
</html>`;
}

export type BrowserFixtureServer = {
    origin: string;
    requests: string[];
    build: {
        entryFingerprint: string;
        bundleFingerprint: string;
    };
    adapter: BrowserPerformanceProvenance["adapter"];
    reset(): void;
    stop(): Promise<void>;
};

export async function startBrowserFixtureServer(): Promise<BrowserFixtureServer> {
    const fixtureBuild = await Bun.build({
        entrypoints: [new URL("./fixture.ts", import.meta.url).pathname],
        target: "browser",
        format: "esm",
    });
    if (!fixtureBuild.success || !fixtureBuild.outputs[0]) {
        throw new Error("Unable to bundle the browser fixture");
    }
    const [fixtureScript, componentBuild] = await Promise.all([
        fixtureBuild.outputs[0].text(),
        buildCurrentBrowserComponent(),
    ]);
    const adapter = await createAdapter("module:quality/image-performance/benchmark/adapters/gatewayImagesAdapter.ts", {
        imageUpstreamDelayMs: 0,
    });
    const requests: string[] = [];
    let server: ReturnType<typeof Bun.serve>;
    try {
        server = Bun.serve({
            port: 0,
            async fetch(request) {
                const url = new URL(request.url);
                if (url.pathname === "/") {
                    return new Response(fixtureHtml(), {
                        headers: { "content-type": "text/html; charset=utf-8" },
                    });
                }
                if (url.pathname === "/component.js") {
                    return new Response(componentBuild.script, {
                        headers: { "content-type": "text/javascript; charset=utf-8" },
                    });
                }
                if (url.pathname === "/fixture.js") {
                    return new Response(fixtureScript, {
                        headers: { "content-type": "text/javascript; charset=utf-8" },
                    });
                }
                const original = /^\/image\/(narrow|wide)$/.exec(url.pathname);
                const media = /^\/\.cms\/media\/performance\/image\/(narrow|wide)$/.exec(url.pathname);
                const derivative = /^\/\.cms\/image\/performance\/image\/(narrow|wide)\/(\d+)\.webp$/.exec(
                    url.pathname,
                );
                if (original || media || derivative) {
                    requests.push(`${url.pathname}${url.search}`);
                    const asset = browserAsset((original ?? media ?? derivative)![1]!);
                    if (derivative) {
                        return adapter.variant(asset, Number(derivative[2]));
                    }
                    return original
                        ? new Response(asset.bytes.slice(), { headers: { "content-type": asset.mediaType } })
                        : adapter.respond(asset, request);
                }
                return new Response("Not found", { status: 404 });
            },
        });
    } catch (error) {
        await adapter.dispose?.();
        throw error;
    }
    let stopped = false;
    return {
        origin: server.url.origin,
        requests,
        build: {
            entryFingerprint: componentBuild.entryFingerprint,
            bundleFingerprint: componentBuild.bundleFingerprint,
        },
        adapter: {
            name: adapter.name,
            implementation: { ...adapter.implementation },
        },
        reset() {
            requests.length = 0;
        },
        async stop() {
            if (stopped) {
                return;
            }
            stopped = true;
            server.stop(true);
            await adapter.dispose?.();
        },
    };
}

function browserAsset(slot: string): LoadedAsset {
    return {
        assetId: slot,
        bytes: syntheticPng(1_600, 1_200, 7),
        mediaType: "image/png",
        width: 1_600,
        height: 1_200,
    };
}

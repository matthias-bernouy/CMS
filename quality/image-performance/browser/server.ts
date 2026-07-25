import { createAdapter, type ImagePerformanceAdapter } from "../core/adapter";
import type { LoadedAsset } from "../core/corpus";
import { syntheticPng } from "../core/png";
import type { BrowserPerformanceProvenance } from "./contracts";
import { buildCurrentBrowserComponent } from "./componentBuild";

function fixtureHtml(responsive: boolean): string {
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
<div class="row"><div class="frame narrow"><img data-slot="narrow" data-source-image-access="public" alt=""></div></div>
<div class="row"><div class="frame wide"><img data-slot="wide" data-source-image-access="public" alt=""></div></div>
<div class="probes" aria-hidden="true">
<img data-probe="empty" data-source-image-access="public" alt="">
<img data-probe="unresolved-source" data-source-image-access="public" alt="">
<img data-probe="unresolved-width" data-source-image-access="public" alt="">
<img data-probe="unresolved-height" data-source-image-access="public" alt="">
<img data-probe="unresolved-sizes" data-source-image-access="public" alt="">
</div>
<script src="/component.js?responsive=${responsive ? "on" : "off"}"></script>
<script type="module" src="/fixture.js"></script>
</body>
</html>`;
}

export type BrowserFixtureServer = {
    origin: string;
    requests: string[];
    build: {
        entryFingerprint: string;
        enabledBundleFingerprint: string;
        disabledBundleFingerprint: string;
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
    const asset = browserAsset();
    const adapter = await createAdapter("module:quality/image-performance/core/sourceImagesAdapter.ts", {
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
                    return new Response(fixtureHtml(url.searchParams.get("rollout") === "candidate"), {
                        headers: { "content-type": "text/html; charset=utf-8" },
                    });
                }
                if (url.pathname === "/component.js") {
                    const script =
                        url.searchParams.get("responsive") === "on"
                            ? componentBuild.enabledScript
                            : componentBuild.disabledScript;
                    return new Response(script, { headers: { "content-type": "text/javascript; charset=utf-8" } });
                }
                if (url.pathname === "/fixture.js") {
                    return new Response(fixtureScript, {
                        headers: { "content-type": "text/javascript; charset=utf-8" },
                    });
                }
                if (url.pathname === "/image/original.png") {
                    requests.push(`${url.pathname}${url.search}`);
                    return sourceImageResponse(adapter, asset, request);
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
            enabledBundleFingerprint: componentBuild.enabledBundleFingerprint,
            disabledBundleFingerprint: componentBuild.disabledBundleFingerprint,
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

function browserAsset(): LoadedAsset {
    return {
        assetId: "browser-fixture-1600x1200",
        bytes: syntheticPng(1_600, 1_200, 7),
        mediaType: "image/png",
        width: 1_600,
        height: 1_200,
    };
}

function sourceImageResponse(
    adapter: ImagePerformanceAdapter,
    asset: LoadedAsset,
    browserRequest: Request,
): Promise<Response> {
    const sourceUrl = new URL(browserRequest.url);
    sourceUrl.searchParams.delete("slot");
    return adapter.respond(
        asset,
        new Request(sourceUrl, {
            headers: browserRequest.headers,
            method: "GET",
        }),
    );
}

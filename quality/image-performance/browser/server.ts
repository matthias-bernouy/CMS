import { syntheticPng } from "../core/png";

const FIXTURE_HTML = `<!doctype html>
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
</style>
</head>
<body>
<div class="row"><div class="frame narrow"><img data-slot="narrow" alt=""></div></div>
<div class="row"><div class="frame wide"><img data-slot="wide" alt=""></div></div>
<script type="module" src="/fixture.js"></script>
</body>
</html>`;

export type BrowserFixtureServer = {
    origin: string;
    requests: string[];
    reset(): void;
    stop(): void;
};

export async function startBrowserFixtureServer(): Promise<BrowserFixtureServer> {
    const build = await Bun.build({
        entrypoints: [new URL("./fixture.ts", import.meta.url).pathname],
        target: "browser",
        format: "esm",
    });
    if (!build.success || !build.outputs[0]) {
        throw new Error("Unable to bundle the real responsive Source image helper");
    }
    const fixtureScript = await build.outputs[0].text();
    const requests: string[] = [];
    const server = Bun.serve({
        port: 0,
        fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/") {
                return new Response(FIXTURE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
            }
            if (url.pathname === "/fixture.js") {
                return new Response(fixtureScript, { headers: { "content-type": "text/javascript; charset=utf-8" } });
            }
            if (url.pathname === "/image/original.png") {
                requests.push(`${url.pathname}${url.search}`);
                const width = Number(url.searchParams.get("cms-width")) || 1_600;
                return new Response(syntheticPng(width, Math.round(width * 0.75), width), {
                    headers: { "cache-control": "no-store", "content-type": "image/png" },
                });
            }
            return new Response("Not found", { status: 404 });
        },
    });
    return {
        origin: server.url.origin,
        requests,
        reset() {
            requests.length = 0;
        },
        stop() {
            server.stop(true);
        },
    };
}

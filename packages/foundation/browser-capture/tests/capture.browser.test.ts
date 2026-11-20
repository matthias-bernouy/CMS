import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { createIsolatedCaptureEngine } from "../src/playwright/engine";
import { CaptureError } from "../src/index";
const engine = () =>
    createIsolatedCaptureEngine({
        bunPath: process.execPath,
        browserPath: chromium.executablePath(),
        modulesPath: resolve("node_modules"),
        sandboxPath: "/usr/bin/bwrap",
    });
const options = { width: 640, height: 360, mode: "viewport" as const, themeMode: "light" as const };
const document = (html: string) => ({
    path: "index.html",
    files: new Map([["index.html", new Blob([html], { type: "text/html" })]]),
});
const browserTest = test.skipIf(process.env.ULVIA_RUN_CAPTURE_BROWSER !== "1");
browserTest.each(["", "?view=home", "caf%C3%A9"])(
    "site origin, exact entry and absolute local assets remain unchanged: %s",
    async (path) => {
        const source = {
            origin: "https://site.test",
            path,
            files: new Map([
                [
                    decodeURIComponent(path.split("?")[0]!) + (path.includes("?") ? `?${path.split("?")[1]}` : ""),
                    new Blob(
                        [
                            `<body><p>https://site.test</p><img src="https://site.test/photo.svg"><script>if(location.href!==${JSON.stringify(`https://site.test/${path}`)})throw new Error("Wrong document URL")</script></body>`,
                        ],
                        { type: "text/html" },
                    ),
                ],
                [
                    "photo.svg",
                    new Blob(
                        [
                            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>',
                        ],
                        { type: "image/svg+xml" },
                    ),
                ],
            ]),
        };
        const image = await engine().capture(source, options);
        expect(image.diagnostics).toEqual([]);
        expect([image.width, image.height]).toEqual([640, 360]);
    },
);
browserTest(
    "isolated worker captures viewport, full page and one element, reporting blocked network",
    async () => {
        const worker = engine();
        const source = document(
            '<html><body style="margin:0"><div id="target" style="width:120px;height:80px;background:#e23143"></div><div style="height:700px"></div><img src="http://127.0.0.1:9/private"></body></html>',
        );
        const viewport = await worker.capture(source, options);
        expect([viewport.width, viewport.height]).toEqual([640, 360]);
        expect(viewport.diagnostics.some((line) => line.includes("Blocked resource"))).toBeTrue();
        const element = await worker.capture(source, { ...options, mode: "element", selector: "#target" });
        expect([element.width, element.height]).toEqual([120, 80]);
        const below = document(
            '<body style="margin:0"><div id="top" style="width:80px;height:80px;background:blue"></div><div style="height:1000px"></div><div id="bottom" style="width:80px;height:80px;background:blue"></div></body>',
        );
        const top = await worker.capture(below, { ...options, mode: "element", selector: "#top" });
        const bottom = await worker.capture(below, { ...options, mode: "element", selector: "#bottom" });
        expect(bottom.bytes).toEqual(top.bytes);
        const full = await worker.capture(source, { ...options, mode: "full-page" });
        expect(full.height).toBeGreaterThan(700);
        await expect(worker.capture(source, { ...options, mode: "element", selector: "div" })).rejects.toThrow(
            CaptureError,
        );
        await expect(
            worker.capture(document('<div style="height:20000px"></div>'), { ...options, mode: "full-page" }),
        ).rejects.toThrow(CaptureError);
    },
    30_000,
);
browserTest(
    "cancellation kills a stuck worker, releases capacity and permits a later capture",
    async () => {
        const worker = engine();
        const abort = new AbortController();
        const pending = worker.capture(document("<script>for(;;){}</script>"), options, abort.signal);
        setTimeout(() => abort.abort(), 1000);
        await expect(pending).rejects.toThrow();
        const result = await worker.capture(document("<p>Recovered</p>"), options);
        expect(result.width).toBe(640);
    },
    15_000,
);
test("missing isolation refuses instead of launching an unprotected browser", async () => {
    const worker = createIsolatedCaptureEngine({
        bunPath: process.execPath,
        browserPath: chromium.executablePath(),
        modulesPath: resolve("node_modules"),
        sandboxPath: "/missing-bwrap",
    });
    await expect(worker.capture(document("<p>test</p>"), options)).rejects.toThrow("UNAVAILABLE");
});

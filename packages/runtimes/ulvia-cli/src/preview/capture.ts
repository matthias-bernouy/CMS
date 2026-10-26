import { serveExampleFiles } from "./server";
import { chromium } from "playwright";
import { join } from "node:path";
import type { CollectionExampleFrame } from "@bernouy/cms-repository/collections/build";

/** Disposable browser contexts and an exact in-memory file map; no remote network access. */
export async function captureCollectionExamples(
    files: ReadonlyMap<string, Blob>,
    frames: readonly CollectionExampleFrame[],
    output: string,
): Promise<readonly { path: string; browserVersion: string; digest: string; byteLength: number }[]> {
    const server = serveExampleFiles(files);
    const origin = server.url.origin;
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const captures = [];
        for (const frame of frames) {
            const context = await browser.newContext({
                viewport: { width: frame.width, height: frame.height },
                colorScheme: frame.themeMode,
                reducedMotion: "reduce",
                serviceWorkers: "block",
            });
            try {
                await context.route("**/*", async (route) => {
                    if (new URL(route.request().url()).origin === origin) {
                        await route.continue();
                    } else {
                        await route.abort();
                    }
                });
                const page = await context.newPage();
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                await page.goto(new URL(frame.path, origin).href, { waitUntil: "networkidle", timeout: 15_000 });
                await page.evaluate(async () => {
                    await document.fonts.ready;
                    await Promise.all(
                        Array.from(document.images).map(async (image) => {
                            const box = image.getBoundingClientRect();
                            if (
                                box.width === 0 ||
                                box.height === 0 ||
                                box.bottom <= 0 ||
                                box.top >= innerHeight ||
                                box.right <= 0 ||
                                box.left >= innerWidth
                            ) {
                                return;
                            }
                            if (!image.complete) {
                                await image.decode();
                            }
                            if (image.naturalWidth === 0) {
                                throw new Error("Example image failed to load");
                            }
                        }),
                    );
                    await new Promise<void>((resolve) =>
                        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
                    );
                });
                if (errors.length) {
                    throw new Error(`Example ${frame.path}: ${errors.join("; ")}`);
                }
                const path = frame.path.replace(/\.html$/, ".png");
                await page.screenshot({ path: join(output, path), fullPage: false });
                const bytes = await Bun.file(join(output, path)).arrayBuffer();
                captures.push({
                    path,
                    browserVersion: browser.version(),
                    digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`,
                    byteLength: bytes.byteLength,
                });
            } finally {
                await context.close();
            }
        }
        return captures;
    } finally {
        await browser?.close();
        server.stop(true);
    }
}

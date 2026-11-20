import type * as Playwright from "playwright";
import type { WorkerInput, WorkerOutput } from "./protocol";
import { CAPTURE_LIMITS, CaptureError, validateCapture } from "../core/limits";

/** All requests are fulfilled from explicit bytes; the OS worker has no network. */
export async function captureWorker(input: WorkerInput): Promise<WorkerOutput> {
    const files = new Map(
        input.files.map((file) => [
            file.path,
            new Blob([Buffer.from(file.base64, "base64")], { type: file.mediaType }),
        ]),
    );
    validateCapture({ path: input.path, files, origin: input.origin }, input.options);
    const { chromium }: typeof Playwright = await import(input.playwrightModule);
    const browser = await chromium.launch({ executablePath: input.executablePath, headless: true });
    try {
        const context = await browser.newContext({
            viewport: { width: input.options.width, height: input.options.height },
            colorScheme: input.options.themeMode,
            reducedMotion: "reduce",
            serviceWorkers: "block",
            acceptDownloads: false,
        });
        const diagnostics: string[] = [];
        const report = (message: string) => {
            if (diagnostics.length < 32) {
                diagnostics.push(message.slice(0, 512));
            }
        };
        await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const path = decodeURIComponent(url.pathname.slice(1)) + url.search;
            const file = url.origin === input.origin && request.method() === "GET" ? files.get(path) : undefined;
            if (!file) {
                report(`Blocked resource: ${url.origin === input.origin ? path : "external origin"}`);
                await route.abort();
                return;
            }
            await route.fulfill({
                body: Buffer.from(await file.arrayBuffer()),
                contentType: file.type || "application/octet-stream",
            });
        });
        const page = await context.newPage();
        context.on("page", (other) => {
            if (other !== page) {
                void other.close().catch(() => undefined);
            }
        });
        page.on("pageerror", (error) => report(`JavaScript: ${error.message}`));
        page.on("crash", () => report("Browser page crashed"));
        await page.goto(`${input.origin}/${input.path}`, { waitUntil: "load", timeout: 12_000 });
        await page.evaluate(async () => {
            for (const image of document.images) {
                image.loading = "eager";
            }
            await document.fonts.ready;
            await Promise.all(
                Array.from(document.images).map(async (image) => {
                    try {
                        await image.decode();
                    } catch {
                        // Broken images are reported separately without hiding the rendered page.
                    }
                }),
            );
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const state = await page.evaluate(() => ({
            width: Math.max(document.documentElement.scrollWidth, innerWidth),
            height: Math.max(document.documentElement.scrollHeight, innerHeight),
            brokenImages: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0)
                .length,
        }));
        if (state.width > input.options.width) {
            report("Horizontal overflow detected");
        }
        if (state.brokenImages) {
            report(`Broken images: ${state.brokenImages}`);
        }
        let clip;
        let width = input.options.width;
        let height = input.options.height;
        if (input.options.mode === "full-page") {
            width = state.width;
            height = state.height;
        } else if (input.options.mode === "element") {
            const locator = page.locator(input.options.selector!);
            if ((await locator.count()) !== 1) {
                throw new CaptureError("INVALID_INPUT");
            }
            await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
            clip = await locator.boundingBox();
            if (!clip || clip.width <= 0 || clip.height <= 0) {
                throw new CaptureError("INVALID_INPUT");
            }
            width = Math.ceil(clip.width);
            height = Math.ceil(clip.height);
        }
        if (
            width > CAPTURE_LIMITS.dimension ||
            height > CAPTURE_LIMITS.fullHeight ||
            width * height > CAPTURE_LIMITS.pixels
        ) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        const bytes = await page.screenshot({
            type: "png",
            animations: "disabled",
            caret: "hide",
            fullPage: input.options.mode === "full-page",
            ...(clip ? { clip } : {}),
        });
        if (bytes.byteLength > CAPTURE_LIMITS.imageBytes) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        // The PNG IHDR is the authoritative pixel size, including fractional element boxes.
        return {
            base64: bytes.toString("base64"),
            width: bytes.readUInt32BE(16),
            height: bytes.readUInt32BE(20),
            browserVersion: browser.version(),
            diagnostics,
        };
    } finally {
        await browser.close();
    }
}

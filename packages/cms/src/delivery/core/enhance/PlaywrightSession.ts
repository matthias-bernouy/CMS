import { chromium, type Browser } from "playwright";
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTHS } from "src/delivery/core/enhance/viewports";

export type ViewportLayout = {
    viewport: number;
    cssWidth: number;
    /** Distance from the top of the viewport at layout time. */
    top: number;
    /** Rendered height in CSS pixels. */
    height: number;
};

export type ImageMeasurement = {
    /** Document-order index of the `<img>`. Aligns with rewriteHTML. */
    index: number;
    /** Source attribute as serialized in the live DOM. */
    src: string;
    /** Browser-reported intrinsic width. 0 when image hasn't loaded. */
    naturalWidth: number;
    /** Per-viewport layout rect as measured by getBoundingClientRect. */
    perViewport: ViewportLayout[];
};

/**
 * Single Chromium instance shared across optimization jobs. Launching
 * Chromium is expensive (≈300 ms cold start) and idempotent — a long-lived
 * browser amortizes that cost across every page save during the server's
 * lifetime. A new browser context is opened per job so cookies / storage
 * never leak from one optimization to the next.
 */
export class PlaywrightSession {
    private _browser: Browser | null = null;
    private _launching: Promise<Browser> | null = null;
    private _disabled = false;

    async measureImages(url: string): Promise<ImageMeasurement[] | null> {
        if (this._disabled) return null;

        let browser: Browser;
        try {
            browser = await this._ensureBrowser();
        } catch (err) {
            // Most likely chromium not installed (`playwright install`
            // wasn't run). Disable for the rest of the process so we don't
            // spam the logs on every save.
            console.warn("[enhance] disabling — Playwright launch failed:", err);
            this._disabled = true;
            return null;
        }

        const context = await browser.newContext({
            viewport: { width: VIEWPORT_WIDTHS[0]!, height: VIEWPORT_HEIGHT },
            reducedMotion: "reduce",
        });
        const page = await context.newPage();

        try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });

            // Catalogue images once, then resize between viewports — the
            // index list is stable as long as no JS adds/removes <img>
            // between resizes (we said "static images only").
            const baseList = await page.evaluate(() => {
                const list = Array.from(document.querySelectorAll("img"));
                return list.map((img, index) => ({
                    index,
                    src: img.getAttribute("src") || "",
                    naturalWidth: (img as HTMLImageElement).naturalWidth || 0,
                }));
            });

            const perImage = new Map<number, ImageMeasurement>();
            for (const b of baseList) {
                perImage.set(b.index, { ...b, perViewport: [] });
            }

            for (const vw of VIEWPORT_WIDTHS) {
                await page.setViewportSize({ width: vw, height: VIEWPORT_HEIGHT });
                // One frame is enough for layout to settle in the absence
                // of JS-driven async rendering. Container queries / fluid
                // widths re-flow synchronously inside setViewportSize.
                const rects = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll("img")).map(img => {
                        const r = (img as HTMLImageElement).getBoundingClientRect();
                        return { width: r.width, top: r.top, height: r.height };
                    });
                });
                rects.forEach((r, i) => {
                    const slot = perImage.get(i);
                    if (slot) slot.perViewport.push({
                        viewport: vw,
                        cssWidth: r.width,
                        top: r.top,
                        height: r.height,
                    });
                });
            }

            return [...perImage.values()];
        } finally {
            await context.close().catch(() => {});
        }
    }

    async close(): Promise<void> {
        const b = this._browser;
        this._browser = null;
        this._launching = null;
        if (b) await b.close().catch(() => {});
    }

    private async _ensureBrowser(): Promise<Browser> {
        if (this._browser) return this._browser;
        if (this._launching) return this._launching;
        this._launching = chromium
            .launch({ headless: true, args: ["--no-sandbox"] })
            .then(b => {
                this._browser = b;
                return b;
            })
            .finally(() => {
                this._launching = null;
            });
        return this._launching;
    }
}

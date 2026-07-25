import type { Browser, Page } from "playwright";
import type { BrowserPerformanceCase } from "../contracts";
import type { BrowserFixtureServer } from "../server";
import { evaluateBrowserCase } from "./evaluate";
import { captureImageResponses, readBrowserEvidence } from "./responses";

export async function runBrowserCase(
    browser: Browser,
    server: BrowserFixtureServer,
    rollout: BrowserPerformanceCase["rollout"],
    loading: BrowserPerformanceCase["loading"],
    dpr: number,
): Promise<BrowserPerformanceCase> {
    server.reset();
    const context = await browser.newContext({
        viewport: { width: 1_000, height: 1_400 },
        deviceScaleFactor: dpr,
    });
    try {
        const page = await context.newPage();
        const capturedResponses = captureImageResponses(page);
        await page.goto(`${server.origin}/?rollout=${rollout}&loading=${loading}`);
        await page.waitForFunction(() => window.__imageFixtureReady === true);
        await waitForImages(page);
        const result = await readBrowserEvidence(page, capturedResponses);
        return evaluateBrowserCase({
            rollout,
            loading,
            dpr,
            cls: result.cls,
            images: result.images,
            requests: [...server.requests],
            responseCaptures: result.responseCaptures,
            activationOrder: result.order,
            domProbes: result.domProbes,
        });
    } finally {
        await context.close();
    }
}

async function waitForImages(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLImageElement>("img[data-slot]")].every(
            (image) => image.complete && image.naturalWidth > 0,
        ),
    );
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
    );
}

import { expect } from "bun:test";
import type { Page } from "playwright";

/** Cookie-bearing asset requests must remain public; the administrator document never does. */
export async function exercisePageDelivery(page: Page, cmsUrl: string) {
    const measurements = [];
    for (let iteration = 0; iteration < 2; iteration++) {
        const response = await page.goto(`${cmsUrl}/admin/pages`, { waitUntil: "networkidle" });
        expect(response?.status()).toBe(200);
        expect(response?.headers()["cache-control"]).toBe("private, no-store");
        await page.locator("#pages-list a[href*='/admin/pages/detail']").first().waitFor({ timeout: 30_000 });
        const assetUrls = await page
            .locator("link[rel='stylesheet'], script[src]")
            .evaluateAll((nodes) =>
                nodes
                    .map((node) => node.getAttribute("href") ?? node.getAttribute("src") ?? "")
                    .filter((url) => url.includes("/_content/bloc")),
            );
        expect(assetUrls.length).toBeGreaterThan(0);
        for (const url of assetUrls) {
            const asset = await page.request.get(new URL(url, cmsUrl).href);
            expect(asset.status()).toBe(200);
            expect(asset.headers()["cache-control"]).toContain("immutable");
            expect(asset.headers()["cache-control"]).not.toContain("private");
            const cached = await page.request.get(new URL(url, cmsUrl).href, {
                headers: { "if-none-match": asset.headers().etag! },
            });
            expect(cached.status()).toBe(304);
        }
        measurements.push(
            await page.evaluate(() => {
                const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
                return {
                    ttfbMs: Math.round(navigation.responseStart - navigation.requestStart),
                    loadedMs: Math.round(navigation.loadEventEnd - navigation.startTime),
                };
            }),
        );
    }
    console.log("Local administrator Page delivery:", JSON.stringify(measurements));
}

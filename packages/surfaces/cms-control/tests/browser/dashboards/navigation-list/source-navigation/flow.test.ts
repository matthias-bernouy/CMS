import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { bundlePath, installNavigation } from "./fixture";

test("bound source navigation retains focused links through refresh, failure and selection and skips hidden entries", async () => {
    const browser = await chromium.launch();
    let release: (() => void) | undefined;
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
        page.setDefaultTimeout(5000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const fixture = await installNavigation(page, await Bun.file(bundlePath).text());
        await page.goto("http://cms.test/admin/sources?source=store&dashboard=store-settings");
        const nav = page.locator("cms-dashboards-nav");
        const store = nav.locator('[data-source="store"]:not([data-nested])');
        const delivery = nav.locator('[data-source="delivery"]:not([data-nested])');
        await store.waitFor();
        expect(await nav.locator("cms-dashboard-input").count()).toBe(0);
        expect(await store.evaluate((node) => node.getRootNode() === document)).toBe(true);
        const original = await delivery.elementHandle();
        await delivery.focus();
        const position = await delivery.boundingBox();
        release = fixture.holdRead();
        const requested = page.waitForRequest((request) => request.url().endsWith("/api/dashboards"));
        await page.evaluate(() => document.dispatchEvent(new Event("dashboard:definitions-changed")));
        await requested;
        expect(await delivery.boundingBox()).toEqual(position);
        expect(await delivery.evaluate((node) => node.matches(":focus"))).toBe(true);
        const completed = page.waitForResponse((response) => response.url().endsWith("/api/dashboards"));
        release();
        await completed;
        for (let frame = 0; frame < 5; frame += 1) {
            await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
            expect(await delivery.boundingBox()).toEqual(position);
            expect(await delivery.evaluate((node) => node.matches(":focus"))).toBe(true);
        }
        expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
        await delivery.click();
        expect(new URL(page.url()).searchParams.get("source")).toBe("delivery");
        expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await delivery.getAttribute("active")).toBe("");
        await nav.locator('[data-dashboard="delivery-settings"]').click();
        expect(new URL(page.url()).searchParams.get("dashboard")).toBe("delivery-settings");
        expect(await nav.locator('[data-dashboard="delivery-settings"]').getAttribute("active")).toBe("");
        fixture.failRead();
        await page.evaluate(() => document.dispatchEvent(new Event("dashboard:definitions-changed")));
        await nav.locator("p9r-alert").filter({ hasText: "Unable to load sources" }).waitFor();
        expect(await nav.getByRole("alert").count()).toBe(1);
        expect(await delivery.isVisible()).toBe(true);
        await nav.getByRole("button", { name: "Retry", exact: true }).click();
        await page.waitForFunction(() => !document.querySelector("cms-dashboards-nav p9r-alert"));
        expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
        expect(fixture.reads.filter((path) => path === "/api/dashboards")).toHaveLength(4);
        expect(errors).toEqual([]);
    } finally {
        release?.();
        await browser.close();
    }
}, 20000);

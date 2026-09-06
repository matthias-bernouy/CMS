import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";
const bundlePath = resolve(import.meta.dir, "../../../src/static/assets/control-components.js");

test("Sources parser keeps catalogue exclusive and the add action above source navigation", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            const url = new URL(route.request().url());
            if (url.pathname === "/control.js") {
                await route.fulfill({ contentType: "text/javascript", body: await Bun.file(bundlePath).text() });
            } else if (route.request().resourceType() === "document") {
                await route.fulfill({
                    contentType: "text/html",
                    body: `<!doctype html>
                    <head><script src="/control.js"></script></head><body>
                    <cms-dashboards-nav example></cms-dashboards-nav>
                    <cms-resource-workspace>
                        <script>window.dashboardWasAbsent = !document.querySelector('cms-dashboards-admin');</script>
                        <cms-dashboards-admin external></cms-dashboards-admin>
                    </cms-resource-workspace></body>`,
                });
            } else {
                await route.fulfill({ json: [] });
            }
        });
        await page.goto("http://cms.test/admin/sources?tab=catalogue");
        expect(
            await page.evaluate(() => (window as unknown as { dashboardWasAbsent: boolean }).dashboardWasAbsent),
        ).toBe(true);
        const dashboard = page.locator("cms-resource-workspace > cms-dashboards-admin");
        await page.waitForFunction(() =>
            document.querySelector("cms-resource-workspace > cms-dashboards-admin")?.hasAttribute("hidden"),
        );
        expect(await dashboard.isVisible()).toBe(false);
        expect(await page.locator("cms-integrations-admin").isVisible()).toBe(true);
        expect(await page.locator("cms-integrations-admin").count()).toBe(1);
        const action = page.locator("cms-dashboards-nav [data-add-source]");
        expect(await action.getAttribute("slot")).toBeNull();
        expect(await action.getAttribute("href")).toBe("/admin/sources?tab=catalogue");
        expect(
            await action.evaluate((node) => {
                const source = node.parentElement?.querySelector("[data-generated]");
                return !!source && !!(node.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING);
            }),
        ).toBe(true);
        await page.evaluate(() => {
            history.replaceState(null, "", "/admin/sources?source=commerce");
            window.dispatchEvent(new Event("cms-resources:route"));
        });
        expect(await dashboard.isVisible()).toBe(true);
        expect(await page.locator("cms-integrations-admin").isVisible()).toBe(false);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../../src/static/assets/control-components.js");

test("Source dashboards fit narrow screens and the reused page picker keeps an opaque themed surface", async () => {
    const browser = await chromium.launch();
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
                    body: `<!doctype html><head><script src="/control.js"></script>
                    <style>body { margin:16px; font:14px sans-serif; }</style></head><body>
                    <cms-dashboards-admin id="dashboard" external></cms-dashboards-admin>
                    <div id="page-field" style="width:190px"><cms-editor-v2-page-link label="Published page"
                    published-only="true" allow-external="false" allow-media="false"></cms-editor-v2-page-link></div>
                    </body>`,
                });
            } else if (url.pathname === "/api/page/links") {
                expect(url.searchParams.get("visible")).toBe("published");
                await route.fulfill({
                    json: [
                        { path: "/terms", title: "Terms" },
                        { path: "/privacy", title: "Privacy" },
                    ],
                });
            } else {
                await route.fulfill({ json: { id: "settings", mode: "Marketplace" } });
            }
        });
        for (const width of [390, 1440]) {
            for (const embedded of [false, true]) {
                await page.setViewportSize({ width, height: 1000 });
                await page.goto("http://cms.test/admin/sources");
                await page.evaluate(
                    ({ embedded, group }) => {
                        const dashboard = document.querySelector("#dashboard") as HTMLElement & {
                            setExternalContext(
                                groups: unknown[],
                                selection: { source: string; dashboard: string },
                            ): void;
                        };
                        dashboard.toggleAttribute("embedded", embedded);
                        dashboard.setExternalContext([group], { source: "store", dashboard: "settings" });
                    },
                    { embedded, group: dashboardGroup() },
                );
                const tabs = page.locator("#dashboard .tab");
                await tabs.first().waitFor({ state: "visible" });
                expect(await tabs.count()).toBe(4);
                for (const tab of await tabs.all()) {
                    const box = await tab.boundingBox();
                    expect(box!.x).toBeGreaterThanOrEqual(0);
                    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
                }
                await tabs.last().click();
                const save = page.getByRole("button", { name: "Save settings", exact: true });
                await save.waitFor({ state: "visible" });
                const box = await save.boundingBox();
                expect(box!.x + box!.width).toBeLessThanOrEqual(width);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                const picker = page.locator("cms-editor-v2-page-link");
                await picker.getByPlaceholder("Search pages").click();
                await picker.locator(".page-option").first().waitFor({ state: "visible" });
                expect(
                    await picker.locator(".picker").evaluate((element) => getComputedStyle(element).backgroundColor),
                ).toBe("rgb(255, 255, 255)");
                expect(
                    await picker
                        .locator(".page-title")
                        .first()
                        .evaluate((element) => getComputedStyle(element).color),
                ).toBe("rgb(21, 27, 25)");
                await picker.getByRole("button", { name: "Privacy /privacy", exact: true }).click();
                expect(await picker.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe(
                    "/privacy",
                );
                await page.locator("#page-field").evaluate((element) => {
                    (element as HTMLElement).style.setProperty("--editor-v2-surface", "#123456");
                    (element as HTMLElement).style.setProperty("--editor-v2-text", "#ffffff");
                });
                await picker.getByPlaceholder("Search pages").click();
                expect(
                    await picker.locator(".picker").evaluate((element) => getComputedStyle(element).backgroundColor),
                ).toBe("rgb(18, 52, 86)");
                expect(
                    await picker
                        .locator(".page-title")
                        .first()
                        .evaluate((element) => getComputedStyle(element).color),
                ).toBe("rgb(255, 255, 255)");
            }
        }
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

function dashboardGroup() {
    return {
        source: { id: "store", urn: "urn:store", name: "Store", endpointCount: 1, dashboardCount: 1, readonly: false },
        endpoints: [{ endpointId: "settings", params: [] }],
        dashboards: [
            {
                id: "settings",
                source: "store",
                meta: { name: "Settings" },
                views: [
                    {
                        widget: "w-tabs",
                        id: "settings-tabs",
                        tabs: ["General", "Notifications", "Protected C2C", "Offer conditions"].map((label, index) => ({
                            id: `tab-${index}`,
                            label,
                            children: [
                                {
                                    widget: "w-detail",
                                    id: `detail-${index}`,
                                    source: { endpoint: "settings" },
                                    title: "Marketplace",
                                    actions: [{ id: "save", label: "Save settings" }],
                                    main: [
                                        {
                                            id: "values",
                                            title: "Configuration",
                                            fields: [{ id: "mode", path: "mode", label: "Mode" }],
                                        },
                                    ],
                                },
                            ],
                        })),
                    },
                ],
            },
        ],
    };
}

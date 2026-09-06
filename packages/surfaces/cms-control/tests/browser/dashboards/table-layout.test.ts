import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../../src/static/assets/control-components.js");

test("a wide dashboard table scrolls inside a narrow grid without overflowing the admin content", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            if (new URL(route.request().url()).pathname === "/control.js") {
                await route.fulfill({ contentType: "text/javascript", body: await Bun.file(bundlePath).text() });
                return;
            }
            await route.fulfill({
                contentType: "text/html",
                body: `<!doctype html><head><script src="/control.js"></script><style>
                body { margin:0; font:14px sans-serif; }
                main { padding:16px; overflow:auto; }
                .management { border:1px solid; padding:14px; }
                .widgets { display:grid; min-width:0; }
                </style></head><body><main><section class="management"><div class="widgets">
                <cms-dashboard-w-table></cms-dashboard-w-table>
                </div></section></main></body>`,
            });
        });
        for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto("http://cms.test/admin/sources");
            await page.evaluate(() => {
                const table = document.querySelector("cms-dashboard-w-table") as HTMLElement & { data: unknown };
                const labels = ["Context", "Status", "Active documents", "Revision", "Updated at"];
                table.data = {
                    title: "Policies",
                    columns: labels.map((label, index) => ({ key: `column-${index}`, label })),
                    rows: [
                        {
                            id: "signup",
                            collection: "policies",
                            cells: Object.fromEntries(
                                ["Signup", "Active", "1", "42", "2026-09-06"].map((value, index) => [
                                    `column-${index}`,
                                    value,
                                ]),
                            ),
                        },
                    ],
                };
                table.addEventListener("cms-dashboard-widget:row-select", () => {
                    table.dataset.selectedByUser = "true";
                });
            });
            const table = page.locator("cms-dashboard-w-table");
            const frame = table.locator(".w-table-frame");
            await table.getByText("Signup", { exact: true }).waitFor({ state: "visible" });
            expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
                true,
            );
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            expect(await frame.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(width === 390);
            await frame.evaluate((element) => (element.scrollLeft = element.scrollWidth));
            const lastHeader = await table.getByRole("columnheader", { name: "Updated at" }).boundingBox();
            const lastCell = await table.getByText("2026-09-06", { exact: true }).boundingBox();
            const viewport = (await frame.boundingBox())!;
            for (const box of [lastHeader!, lastCell!]) {
                expect(box.x).toBeGreaterThanOrEqual(viewport.x);
                expect(box.x + box.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1);
            }
            await frame.evaluate((element) => (element.scrollLeft = 0));
            await table.getByRole("checkbox", { name: "Select row signup", exact: true }).check();
            expect(await table.getByRole("checkbox", { name: "Select row signup", exact: true }).isChecked()).toBe(
                true,
            );
            await table.getByText("Signup", { exact: true }).click();
            expect(await table.getAttribute("data-selected-by-user")).toBe("true");
        }
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

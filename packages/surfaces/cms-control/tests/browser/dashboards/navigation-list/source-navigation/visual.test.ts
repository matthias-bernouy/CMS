import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { bundlePath, installNavigation } from "./fixture";

test("source navigation preserves links, icons and selected states on desktop and mobile", async () => {
    const browser = await chromium.launch();
    const baseline = process.env.CMS_NAV_BASELINE;
    const captures = process.env.CMS_NAV_CAPTURES;
    const positions = new Map<string, (string | number | boolean)[][]>();
    if (captures) {
        await mkdir(captures, { recursive: true });
    }
    try {
        for (const mode of baseline ? ["before", "after"] : ["after"]) {
            for (const width of [1440, 390]) {
                const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
                page.setDefaultTimeout(5000);
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                const fixture = await installNavigation(
                    page,
                    await Bun.file(mode === "before" ? baseline! : bundlePath).text(),
                );
                for (const [state, query] of [
                    ["store", "source=store&dashboard=store-settings"],
                    ["delivery", "source=delivery&dashboard=delivery-settings"],
                ]) {
                    const start = performance.now();
                    await page.goto(`http://cms.test/admin/sources?${query}`);
                    await page
                        .locator('cms-dashboards-nav [data-source="store"]')
                        .first()
                        .waitFor({ state: "attached" });
                    if (width === 390) {
                        await page.getByRole("button", { name: "Section", exact: true }).click();
                    }
                    const items = page.locator("cms-dashboards-nav w13c-lateral-menu-item:visible");
                    const geometry = await items.evaluateAll((nodes) =>
                        nodes.map((node) => {
                            const box = node.getBoundingClientRect();
                            return [
                                node.textContent?.trim(),
                                node.hasAttribute("active"),
                                box.x,
                                box.y,
                                box.width,
                                box.height,
                            ];
                        }),
                    );
                    const key = `${width}-${state}`;
                    if (mode === "before") {
                        positions.set(key, geometry);
                    } else if (baseline) {
                        expect(geometry).toEqual(positions.get(key)!);
                    }
                    expect(await items.count()).toBe(4);
                    expect(errors).toEqual([]);
                    if (captures) {
                        await page.screenshot({ path: `${captures}/${mode}-${key}.png`, animations: "disabled" });
                        console.info(
                            JSON.stringify({
                                mode,
                                width,
                                state,
                                readyMs: performance.now() - start,
                                reads: fixture.reads.length,
                            }),
                        );
                    }
                }
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }
}, 30000);

import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { healthPage, initialHealth, installHealthRoutes } from "./fixture";
const bundle = await Bun.file(
    resolve(import.meta.dir, "../../../../../../src/static/assets/control-components.js"),
).text();
const styles = await Bun.file(
    resolve(import.meta.dir, "../../../../../../../../foundation/components/dist/style.css"),
).text();

test("Health preserves observation, recovery actions and operation presentation on desktop and mobile", async () => {
    const browser = await chromium.launch();
    const baseline = process.env.CMS_HEALTH_BASELINE;
    const captures = process.env.CMS_HEALTH_CAPTURES;
    const geometry = new Map<string, Array<Array<string | number>>>();
    if (captures) {
        await mkdir(captures, { recursive: true });
    }
    try {
        for (const mode of baseline ? ["before", "after"] : ["after"]) {
            for (const width of [1440, 390]) {
                const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
                page.setDefaultTimeout(5000);
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                const fixture = await installHealthRoutes(
                    page,
                    mode === "before" ? await Bun.file(baseline!).text() : bundle,
                    styles,
                );
                for (const state of ["stale", "fresh", "absent", "unsupported"] as const) {
                    const health = initialHealth();
                    if (state === "fresh") {
                        health.freshness = "fresh";
                        health.report!.configuration.appliedRevision = "v2";
                    }
                    if (state === "absent") {
                        health.report!.configuration = { savedRevision: null, appliedRevision: null };
                    }
                    if (state === "unsupported") {
                        health.report = null;
                        health.freshness = "unavailable";
                        health.observation = "unsupported";
                    }
                    fixture.setHealth(health);
                    const start = performance.now();
                    await page.goto(healthPage);
                    await page.getByText("Observed version: 1.0.0", { exact: true }).waitFor();
                    const readyMs = performance.now() - start;
                    const content = page.locator("[data-health-content]");
                    const positions = await content.locator("button, h3, p, [data-check-id]").evaluateAll((nodes) =>
                        nodes.map((node) => {
                            const box = node.getBoundingClientRect();
                            return [(node.textContent ?? "").replace(/\s+/g, ""), box.x, box.y, box.width, box.height];
                        }),
                    );
                    const key = `${width}-${state}`;
                    if (mode === "before") {
                        geometry.set(key, positions);
                    } else if (baseline) {
                        expect(positions).toEqual(geometry.get(key)!);
                    }
                    expect(
                        await page.getByText("Observation issue: forbidden (HTTP 403)", { exact: true }).isVisible(),
                    ).toBe(true);
                    if (state === "unsupported") {
                        expect(await content.getByRole("button").count()).toBe(1);
                        expect(
                            await page
                                .getByText("No valid service observation is available.", { exact: true })
                                .isVisible(),
                        ).toBe(true);
                    } else {
                        expect(await content.getByRole("button").count()).toBe(2);
                        expect(
                            await content.getByRole("button", { name: "Repair connection", exact: true }).count(),
                        ).toBe(1);
                        expect(await page.getByText("Operation apply-2: running", { exact: true }).isVisible()).toBe(
                            true,
                        );
                    }
                    expect(fixture.actions).toHaveLength(0);
                    expect(errors).toEqual([]);
                    if (captures) {
                        await page.screenshot({ path: `${captures}/${mode}-${key}.png`, animations: "disabled" });
                        console.info(JSON.stringify({ mode, width, state, readyMs, reads: fixture.reads.length }));
                    }
                }
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }
}, 30000);

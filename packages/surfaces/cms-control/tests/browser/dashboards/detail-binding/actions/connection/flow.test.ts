import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { installConnectionRoutes } from "./fixture";

const bundle = await Bun.file(
    resolve(import.meta.dir, "../../../../../../src/static/assets/control-components.js"),
).text();
const styles = await Bun.file(
    resolve(import.meta.dir, "../../../../../../../../foundation/components/dist/style.css"),
).text();

test("integration connection fields preserve their presentation, canonical saves and retry behavior", async () => {
    const browser = await chromium.launch();
    try {
        for (const mode of ["after"]) {
            for (const width of [1440, 390]) {
                const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
                page.setDefaultTimeout(5000);
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                const fixture = await installConnectionRoutes(page, bundle, styles);
                const start = performance.now();
                await page.goto("http://cms.test/admin/sources?integration=service");
                const field = page.locator('[data-field-control="country"] input');
                await field.waitFor();
                expect(await field.inputValue()).toBe("FR");
                expect(performance.now() - start).toBeLessThan(5000);
                if (mode === "after") {
                    expect(
                        await page
                            .locator("cms-dashboard-w-detail [data-field-control]")
                            .evaluateAll((nodes) => nodes.every((node) => node.getRootNode() === document)),
                    ).toBe(true);
                }
                const save = page.getByRole("button", { name: "Save settings", exact: true });
                await field.fill("");
                await save.click();
                expect(fixture.writes).toHaveLength(0);
                await field.fill("be");
                fixture.failSave();
                await save.click();
                await page.getByRole("alert").filter({ hasText: "Please retry this save." }).waitFor();
                expect(await field.inputValue()).toBe("be");
                const saved = page.waitForResponse(
                    (response) =>
                        response.url().includes("/service/saveConnection") &&
                        response.request().method() === "POST" &&
                        response.status() === 200,
                );
                await save.click();
                await saved;
                await page.waitForFunction(
                    () => document.querySelector<HTMLInputElement>('input[name="expectedRevision"]')?.value === "v3",
                );
                expect(await field.inputValue()).toBe("BE");
                expect(fixture.settings().values.metadata).toEqual({ keep: true });
                await page.reload();
                await field.waitFor();
                expect(await field.inputValue()).toBe("BE");
                expect(
                    await page
                        .locator("cms-integration-management, [data-upgrade-panel], [data-health-content]")
                        .count(),
                ).toBe(0);
                expect(fixture.writes).toHaveLength(2);
                expect(errors).toEqual([]);
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }
}, 30000);

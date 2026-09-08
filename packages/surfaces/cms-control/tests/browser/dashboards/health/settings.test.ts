import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { mountHealthFixture } from "./fixture";
let browser: Browser;
beforeAll(async () => {
    browser = await chromium.launch();
});
afterAll(async () => {
    await browser.close();
});

test("connection Save sends native nested values and revision, preserves nodes, and handles failed reads", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
        const { state, errors } = await mountHealthFixture(
            page,
            '<cms-dashboards-admin embedded dashboard-id="service-connection"></cms-dashboards-admin>',
        );
        const field = page.locator('p9r-input[data-field-control="country"] input');
        await field.waitFor();
        await page.waitForFunction(
            () => document.querySelector<HTMLInputElement>('input[name="expectedRevision"]')?.value === "r1",
        );
        await field.fill("BE");
        await page.evaluate(() => {
            (window as any).originalField = document.querySelector('[data-field-control="country"]');
        });
        const form = page.locator("[data-detail-save]");
        const baseline = await field.boundingBox();
        state.saveDelay = 100;
        state.readDelay = 200;
        await form.evaluate((form: HTMLFormElement) => form.requestSubmit());
        await page.waitForFunction(
            () => document.querySelector("cms-dashboard-w-detail")?.getAttribute("aria-busy") === "true",
        );
        await form.evaluate((form: HTMLFormElement) => form.requestSubmit());
        await page.waitForFunction(
            () => document.querySelector<HTMLInputElement>('input[name="expectedRevision"]')?.value === "r2",
        );
        expect(state.writes).toEqual([
            {
                path: "/.cms/sources/service/saveConnection",
                body: { expectedRevision: "r1", values: { market: { country: "BE" }, apiKey: "${TEST_KEY}" } },
            },
        ]);
        expect(state.settingsReads).toBe(2);
        expect(state.definitionsReads).toBe(1);
        expect(
            await page.evaluate(
                () => (window as any).originalField === document.querySelector('[data-field-control="country"]'),
            ),
        ).toBe(true);
        expect((await field.boundingBox())?.y).toBe(baseline?.y);
        state.saveStatus = 409;
        await field.fill("NL");
        await form.evaluate((form: HTMLFormElement) => form.requestSubmit());
        await page.getByRole("alert").filter({ hasText: "Save rejected" }).waitFor();
        expect(await field.inputValue()).toBe("NL");
        expect(state.settingsReads).toBe(2);
        state.saveStatus = 200;
        state.readStatus = 503;
        await form.evaluate((form: HTMLFormElement) => form.requestSubmit());
        await page.getByRole("alert").filter({ hasText: "Unable to load this data" }).waitFor();
        const writes = state.writes.length;
        state.readStatus = 200;
        await page.locator("[data-dashboard-source-retry]").click();
        await page.waitForFunction(
            () => document.querySelector<HTMLInputElement>('input[name="expectedRevision"]')?.value === "r3",
        );
        expect(state.writes).toHaveLength(writes);
        expect(await field.inputValue()).toBe("NL");
        expect(errors).toEqual([]);
        await page.screenshot({ path: "/tmp/cmscore-health-settings-e2e.png", fullPage: true });
    } finally {
        await page.close();
    }
}, 30000);

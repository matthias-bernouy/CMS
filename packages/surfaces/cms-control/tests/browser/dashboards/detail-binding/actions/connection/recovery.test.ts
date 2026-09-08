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

test("connection read retries and a detached save cannot overwrite the newly selected panel", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(5000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const fixture = await installConnectionRoutes(page, bundle, styles);
        fixture.failRead();
        await page.goto("http://cms.test/admin/sources?integration=service");
        await page.getByText("Unable to load this data", { exact: false }).waitFor();
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        const country = page.locator('[data-field-control="country"] input');
        await country.fill("be");
        expect(
            fixture.requests.filter((request) => request === "GET /.cms/sources/service/getConnection"),
        ).toHaveLength(2);
        const release = fixture.holdSave();
        await page.getByRole("button", { name: "Save settings", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("cms-dashboard-w-detail")?.hasAttribute("aria-busy"));
        // A client navigation replaces the management host while its submitted operation finishes.
        await page.locator("cms-dashboard-w-detail").evaluate((node) => {
            history.replaceState(null, "", "/admin/health?integration=service");
            const next = document.createElement("cms-health-operations");
            next.setAttribute("installation-id", "service");
            node.closest("cms-dashboards-admin")!.replaceWith(next);
        });
        await page.getByText("No valid service observation", { exact: false }).waitFor();
        release();
        await page.waitForTimeout(250);
        await page.waitForFunction(() => !document.querySelector("cms-dashboard-w-detail"));
        expect(await page.getByText("No valid service observation", { exact: false }).isVisible()).toBe(true);
        expect(await page.getByRole("status").filter({ hasText: "Changes saved" }).count()).toBe(0);
        expect(fixture.settings().values.country).toBe("BE");
        expect(fixture.writes).toHaveLength(1);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20000);

test("an empty connection response shows a recoverable state instead of loading forever", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(5000);
        const fixture = await installConnectionRoutes(page, bundle, styles);
        await page.route("**/.cms/sources/service/getConnection*", (route) => route.fulfill({ json: null }), {
            times: 1,
        });
        await page.goto("http://cms.test/admin/sources?integration=service");
        await page.getByText("No data is available.", { exact: false }).waitFor();
        expect(await page.getByText("Loading data…", { exact: true }).count()).toBe(0);
        expect(await page.getByRole("button", { name: "Save settings", exact: true }).count()).toBe(0);
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        const country = page.locator('[data-field-control="country"] input');
        await country.waitFor();
        expect(await country.inputValue()).toBe("FR");
        expect(fixture.writes).toHaveLength(0);
    } finally {
        await browser.close();
    }
}, 20000);

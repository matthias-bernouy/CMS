import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { productFixture, detailUrl } from "../fixture";

const newUrl = detailUrl.replace("row=42", "row=__new__");
test("creation errors preserve inputs and retry uses the same technical creation reference", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(6000);
        const state = await productFixture(page);
        const attempts: any[] = [];
        await page.route("**/upsertProduct", async (route) => {
            attempts.push(route.request().postDataJSON());
            if (attempts.length === 1) {
                await route.fulfill({ status: 409, json: { error: "Slug already used" } });
            } else {
                await route.fallback();
            }
        });
        await page.goto(newUrl);
        const title = page.locator('[name="title"] input');
        await title.fill("Retained creation");
        const node = await title.elementHandle();
        await page.getByRole("button", { name: "Save product", exact: true }).click();
        const toast = page.locator("p9r-toast").filter({ hasText: "Slug already used" });
        await toast.waitFor();
        expect(await toast.count()).toBe(1);
        expect(await page.locator('[data-detail-save] p9r-alert[role="alert"]').count()).toBe(0);
        expect(await title.inputValue()).toBe("Retained creation");
        expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
        expect(state.creates).toHaveLength(0);
        await page.getByRole("button", { name: "Save product", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("row") === "43");
        expect(attempts).toHaveLength(2);
        expect(attempts[1].creationToken).toBe(attempts[0].creationToken);
        expect(state.creates).toHaveLength(1);
        expect(state.errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 15000);

test("an invalid successful creation response cannot accidentally submit a second creation", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(6000);
        await productFixture(page);
        let attempts = 0;
        await page.route("**/upsertProduct", (route) => {
            attempts++;
            return route.fulfill({ json: { ok: true } });
        });
        await page.goto(newUrl);
        await page.locator('[name="title"] input').fill("Created without response id");
        await page.getByRole("button", { name: "Save product", exact: true }).click();
        await page.locator("[data-create-result-invalid]").waitFor();
        await page.locator("[data-detail-save]").evaluate((form: HTMLFormElement) => form.requestSubmit());
        expect(attempts).toBe(1);
        expect(await page.locator('[name="title"] input').inputValue()).toBe("Created without response id");
    } finally {
        await browser.close();
    }
}, 15000);

test("a creation modal guards dirty dismissal and cannot close or submit twice during its write", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(6000);
        const state = await productFixture(page);
        await page.goto(detailUrl);
        await page.locator('[name="title"] input').fill("Parent draft");
        await page.locator("[data-lookup-create]").click();
        const modal = page.locator("[data-detail-modal]");
        await modal.locator('[name="name"] input').fill("Guarded brand");
        await modal.locator('[name="slug"] input').fill("guarded-brand");
        page.once("dialog", (dialog) => dialog.dismiss());
        await page.keyboard.press("Escape");
        expect(await modal.getAttribute("open")).not.toBeNull();
        state.brandSaveDelay = 250;
        const request = page.waitForRequest("**/upsertBrand");
        await modal.getByRole("button", { name: "Save brand", exact: true }).click();
        await request;
        await page.keyboard.press("Escape");
        expect(await modal.getAttribute("open")).not.toBeNull();
        await modal.locator("[data-detail-save]").evaluate((form: HTMLFormElement) => form.requestSubmit());
        await modal.waitFor({ state: "detached" });
        expect(state.brands).toHaveLength(1);
        expect(state.writes).toHaveLength(0);
        expect(await page.locator('[name="title"] input').inputValue()).toBe("Parent draft");
        expect(state.errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 15000);

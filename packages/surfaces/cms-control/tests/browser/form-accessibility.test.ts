import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../src/static/assets/control-components.js");

test("admin form controls expose names, validity, keyboard selection, and Enter submission", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.setContent(`
            <form id="submit-form">
                <p9r-input name="query" label="Search" autocomplete="off" hint="Search all resources"></p9r-input>
                <p9r-button type="submit" aria-label="Run search">Run</p9r-button>
            </form>
            <form id="input-form"><p9r-input name="title" label="Title" required></p9r-input></form>
            <form id="textarea-form"><p9r-textarea name="notes" label="Notes" required></p9r-textarea></form>
            <form id="select-form">
                <p9r-select name="category" label="Category" required value="">
                    <option value="" selected>Choose a category</option>
                    <option value="alpha">Alpha</option>
                </p9r-select>
            </form>
            <form id="combobox-form"><p9r-combobox name="owner" label="Owner" required></p9r-combobox></form>
            <form id="token-form"><p9r-token-input name="tags" label="Tags" required></p9r-token-input></form>
            <w13c-switch aria-label="Allow publishing"></w13c-switch>
            <p9r-segmented-switch value="light" aria-label="Select mode">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </p9r-segmented-switch>
            <p9r-button type="button" aria-label="Save changes">Save</p9r-button>
        `);
        await page.addScriptTag({ path: bundlePath });
        await page.waitForFunction(() => customElements.get("p9r-select") !== undefined);

        const input = page.locator("#submit-form p9r-input input");
        await page.evaluate(() => {
            const form = document.querySelector<HTMLFormElement>("#submit-form")!;
            (window as Window & { submitCount?: number }).submitCount = 0;
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                (window as Window & { submitCount?: number }).submitCount! += 1;
            });
        });
        await page.locator("#submit-form p9r-input label").click();
        expect(
            await page.locator("#submit-form p9r-input").evaluate((host) => host.shadowRoot?.activeElement?.id),
        ).toBe("input");
        expect(await input.getAttribute("autocomplete")).toBe("off");
        expect(await input.getAttribute("aria-describedby")).toBe("hint");

        await input.fill("products");
        await input.press("Enter");
        await page.waitForFunction(() => (window as Window & { submitCount?: number }).submitCount === 1);
        expect(await page.evaluate(() => (window as Window & { submitCount?: number }).submitCount)).toBe(1);
        await page.getByRole("button", { name: "Run search" }).click();
        expect(await page.evaluate(() => (window as Window & { submitCount?: number }).submitCount)).toBe(2);

        const changeEventCount = await page.locator("#submit-form p9r-input").evaluate((host) => {
            (host as HTMLElement & { changeCount?: number }).changeCount = 0;
            host.addEventListener("change", () => {
                (host as HTMLElement & { changeCount?: number }).changeCount! += 1;
            });
            return (host as HTMLElement & { changeCount?: number }).changeCount;
        });
        expect(changeEventCount).toBe(0);
        await input.fill("updated products");
        await input.press("Tab");
        expect(
            await page
                .locator("#submit-form p9r-input")
                .evaluate((host) => (host as HTMLElement & { changeCount?: number }).changeCount),
        ).toBe(1);

        const inputEventCount = await page.locator("#submit-form p9r-input").evaluate((host) => {
            let count = 0;
            host.addEventListener("input", () => {
                count += 1;
            });
            host.shadowRoot
                ?.querySelector("input")
                ?.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
            return count;
        });
        expect(inputEventCount).toBe(1);

        expect(
            await page.evaluate(() =>
                ["input-form", "textarea-form", "select-form", "combobox-form", "token-form"].map((id) =>
                    document.querySelector<HTMLFormElement>(`#${id}`)!.checkValidity(),
                ),
            ),
        ).toEqual([false, false, false, false, false]);

        const select = page.getByRole("combobox", { name: "Category" });
        expect(await select.count()).toBe(1);
        expect(await page.locator("#select-form p9r-select [role='option']").count()).toBe(2);
        await select.focus();
        await select.press("ArrowDown");
        await select.press("Enter");
        await page.waitForFunction(
            () => document.querySelector<HTMLElement & { value: string }>("#select-form p9r-select")?.value === "alpha",
        );
        expect(await select.getAttribute("aria-expanded")).toBe("false");

        expect(await page.getByRole("switch", { name: "Allow publishing" }).count()).toBe(1);
        expect(await page.getByRole("checkbox", { name: "Allow publishing" }).count()).toBe(0);
        expect(await page.getByRole("radiogroup", { name: "Select mode" }).count()).toBe(1);
        expect(await page.getByRole("button", { name: "Save changes" }).count()).toBe(1);
        expect(pageErrors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);

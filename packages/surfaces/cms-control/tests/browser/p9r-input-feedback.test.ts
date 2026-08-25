import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../src/static/assets/control-components.js");

test("p9r-input exposes help and blocking errors in a real browser", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.setContent(`
            <form id="page-form">
                <p9r-input
                    name="path"
                    label="Path"
                    placeholder="/about-morrow"
                    hint='Starts with "/". Use letters, numbers and hyphens only.'
                    help="The path determines the public URL."
                    required
                ></p9r-input>
            </form>
        `);
        await page.addScriptTag({ path: bundlePath });
        await page.waitForFunction(() => customElements.get("p9r-input") !== undefined);

        const control = page.locator("p9r-input");
        const input = control.locator("input");
        const hint = control.locator(".hint");
        const error = control.locator(".error");
        const helpButton = control.getByRole("button", { name: "More information about Path" });
        const helpPopover = control.locator(".help-popover");

        expect(await input.getAttribute("placeholder")).toBe("/about-morrow");
        expect(await hint.textContent()).toBe('Starts with "/". Use letters, numbers and hyphens only.');
        expect(await hint.isVisible()).toBe(true);

        await helpButton.click();
        expect(await helpButton.getAttribute("aria-expanded")).toBe("true");
        expect(await helpPopover.evaluate((element) => element.matches(":popover-open"))).toBe(true);
        expect(await helpPopover.textContent()).toContain("The path determines the public URL.");
        await helpButton.press("Escape");
        expect(await helpButton.getAttribute("aria-expanded")).toBe("false");
        expect(await helpPopover.isHidden()).toBe(true);

        expect(await page.locator("#page-form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
        expect(await error.textContent()).toBe("This field is required.");
        expect(await input.getAttribute("aria-invalid")).toBe("true");
        expect(await input.getAttribute("aria-errormessage")).toBe("error");
        expect(await hint.isHidden()).toBe(true);

        await input.fill("/about-morrow");
        expect(await page.locator("#page-form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true);
        expect(await hint.isVisible()).toBe(true);

        await control.evaluate((element: HTMLElement & { setCustomValidity(message: string): void }) => {
            element.setCustomValidity("A page already uses this path.");
        });
        expect(await page.locator("#page-form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
        expect(await error.textContent()).toBe("A page already uses this path.");

        await control.evaluate((element: HTMLElement & { setCustomValidity(message: string): void }) => {
            element.setCustomValidity("");
        });
        expect(await page.locator("#page-form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true);
        expect(await hint.isVisible()).toBe(true);
        expect(pageErrors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);

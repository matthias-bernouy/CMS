import { expect, test } from "bun:test";
import { configureSiteTheme } from "../../control/bloc-library/fixtures";
import { fixture } from "./fixture";

test("site theme tokens use grouped navigation, preview and editable values", async () => {
    const context = await fixture();
    const { browser, page, errors, writes } = context;
    try {
        await configureSiteTheme(context);
        await context.gotoCollection("/admin/collections/code/theme");
        const menu = page.locator('w13c-lateral-menu[aria-label="Theme tokens"]');
        const shell = page.locator('cms-shell-detail[size="full"]');
        const specimen = page.locator("cms-theme-specimen");
        await specimen.waitFor();
        expect(await menu.getByRole("button", { name: "Site · Interface 5", exact: true }).count()).toBe(1);
        expect(await specimen.getAttribute("view")).toBe("overview");

        await menu.getByRole("button", { name: "Site · Interface 5", exact: true }).click();
        await menu.getByRole("link", { name: "Primary", exact: true }).click();
        await page.waitForURL("**/theme?token=primary-base");
        expect(await shell.locator(':scope > [slot="title"]').textContent()).toBe("Primary");

        const editor = page.locator("cms-theme-token-editor");
        const save = shell.getByRole("button", { name: "Save", exact: true });
        const valuesTab = shell.getByRole("tab", { name: "Values", exact: true });
        if (await valuesTab.count()) {
            await valuesTab.click();
        }
        await editor.waitFor();
        expect(await editor.getAttribute("default-source")).toBe("Site variables");
        const lightValue = editor.locator('[data-theme-mode="light"] [data-token-value-control]');
        await lightValue.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "#224466";
            control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
        await save.click();
        await editor.getByText("Saved.", { exact: true }).waitFor();
        const savedTheme = writes.findLast(({ path }) => path === "/api/system/settings")?.body.theme as {
            themes: Array<{ id: string; values: { light: Record<string, string> } }>;
            activeThemeId: string;
        };
        expect(savedTheme.themes.find(({ id }) => id === savedTheme.activeThemeId)?.values.light).toMatchObject({
            "primary-base": "#224466",
        });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector("cms-shell-detail-body")?.hasAttribute("compact"));
        expect(await shell.getByRole("tab", { name: "Preview", exact: true }).count()).toBe(1);
        expect(await shell.getByRole("tab", { name: "Values", exact: true }).count()).toBe(1);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20_000);

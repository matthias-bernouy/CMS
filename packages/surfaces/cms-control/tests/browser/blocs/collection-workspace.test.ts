import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("collection routes expose overview, theme, Blocs and Texts from one workspace", async () => {
    const { browser, page, errors, gotoCollection } = await fixture();
    try {
        await gotoCollection("/admin/collections/code/overview");
        const tab = (section: string) => page.locator(`[data-collection-section="${section}"]`).getByRole("link");
        await tab("overview").waitFor();
        expect(await tab("overview").getAttribute("aria-current")).toBe("page");
        expect(await tab("blocs").getAttribute("href")).toBe("/tenant/cms/admin/collections/code/blocs");
        expect(await page.getByRole("button", { name: "Check updates", exact: true }).count()).toBe(0);
        expect(await page.locator("cms-collection-workspace").innerText()).toContain("Uses site theme");

        await tab("theme").click();
        await page.waitForURL("**/admin/collections/code/theme");
        await page.getByText("No resolved theme tokens", { exact: true }).waitFor();

        await tab("blocs").click();
        await page.waitForURL("**/admin/collections/code/blocs");
        const navigation = page.locator('w13c-lateral-menu[aria-label="Collection blocs"]');
        await navigation.waitFor();
        expect(await navigation.getByRole("link", { name: "Gallery card", exact: true }).count()).toBe(1);
        expect(await page.locator(".collection-availability").count()).toBe(0);
        expect(await page.locator("cms-bloc-preview").getAttribute("src")).toBe(
            "/tenant/cms/api/bloc/preview?id=code-card",
        );

        await navigation.getByRole("link", { name: "Gallery card", exact: true }).click();
        await page.waitForURL("**/admin/collections/code/blocs?bloc=gallery-card");
        expect(await page.locator("cms-bloc-defaults").getAttribute("values")).toContain("tone");

        await tab("texts").click();
        await page.waitForURL("**/admin/collections/code/texts");
        await page.getByText("Checkout title", { exact: true }).waitFor();
        expect(await page.getByRole("button", { name: "Save translation", exact: true }).isDisabled()).toBe(true);
        expect(
            await page.locator('p9r-input[aria-label="French translation for Checkout title"]').getAttribute("value"),
        ).toBe("Finalisez votre commande");
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20_000);

test("collection workspace remains usable on a narrow viewport", async () => {
    const { browser, page, errors, gotoCollection } = await fixture();
    try {
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoCollection("/admin/collections/code/blocs?bloc=gallery-card");
        const body = page.locator("cms-shell-detail-body");
        await page.waitForFunction(() => document.querySelector("cms-shell-detail-body")?.hasAttribute("compact"));
        expect(await body.getByRole("tab", { name: "Preview", exact: true }).count()).toBe(1);
        expect(await body.getByRole("tab", { name: "Defaults", exact: true }).count()).toBe(1);
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        ).toBe(true);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

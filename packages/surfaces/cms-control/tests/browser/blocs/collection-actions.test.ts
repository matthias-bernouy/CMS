import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("collection creation, settings and first composition use the canonical workspace", async () => {
    const { browser, page, errors, gotoCollection, repository, writes } = await fixture();
    try {
        await gotoCollection();
        await page.getByText("Organize your blocs", { exact: true }).waitFor();
        expect(
            await page.locator('w13c-lateral-menu-item[href="/tenant/cms/admin/collections/code/overview"]').count(),
        ).toBe(1);
        expect(await page.getByRole("button", { name: "Import collection", exact: true }).count()).toBe(0);

        await page.getByRole("button", { name: "Create private collection", exact: true }).click();
        const creation = page.locator("#new-collection-modal");
        await creation.getByLabel("Label", { exact: true }).fill("Editorial");
        await Promise.all([
            page.waitForURL((url) => /\/admin\/collections\/site:[^/]+\/overview$/u.test(url.pathname)),
            creation.getByRole("button", { name: "Create collection", exact: true }).click(),
        ]);
        await page.getByText("Editorial", { exact: true }).first().waitFor();
        const collectionId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-2)!).slice(5);

        await page.getByRole("button", { name: "Collection settings", exact: true }).click();
        const settings = page.locator("#collection-settings-modal");
        await settings.getByLabel("Label", { exact: true }).fill("Editorial library");
        await settings.getByRole("button", { name: "Save collection", exact: true }).click();
        await page.getByText("Editorial library", { exact: true }).first().waitFor();

        await Promise.all([
            page.waitForURL((url) => url.pathname.endsWith("/blocs")),
            page.locator('[data-collection-section="blocs"]').getByRole("link").click(),
        ]);
        await page.getByRole("button", { name: "New composition", exact: true }).click();
        const composition = page.locator("#new-composition-modal");
        await composition.getByLabel("Name", { exact: true }).fill("Editorial introduction");
        await Promise.all([
            page.waitForURL((url) => url.pathname.endsWith("/editor/bloc") && Boolean(url.searchParams.get("id"))),
            composition.getByRole("button", { name: "Create and open editor", exact: true }).click(),
        ]);

        expect((await repository.getSiteBlocCollections()).find(({ id }) => id === collectionId)?.name).toBe(
            "Editorial library",
        );
        expect(writes.findLast(({ path }) => path === "/api/site-bloc")?.body).toMatchObject({
            name: "Editorial introduction",
            collectionId,
        });
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20_000);

import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("collection creation, settings and first composition use the canonical workspace", async () => {
    const { browser, page, errors, gotoCollection, repository, writes } = await fixture();
    try {
        await gotoCollection();
        await page.getByRole("heading", { name: "additional", exact: true }).waitFor();
        expect(await page.getByRole("heading", { name: "Your collections", exact: true }).count()).toBe(0);
        expect(await page.getByRole("heading", { name: "Discover collections", exact: true }).count()).toBe(1);
        expect(await page.getByRole("heading", { name: "gallery", exact: true }).count()).toBe(1);
        expect(
            await page
                .locator('w13c-lateral-menu-item[href="/tenant/cms/admin/collections/managed%3Agallery/overview"]')
                .count(),
        ).toBe(1);
        expect(await page.locator(".collection-explore-card").count()).toBe(2);
        expect(await page.getByRole("link", { name: "Open collection", exact: true }).count()).toBe(1);
        expect((await page.locator(".collection-explore-card").first().boundingBox())?.width).toBeGreaterThanOrEqual(
            420,
        );

        await page.getByRole("button", { name: "Create private collection", exact: true }).click();
        const creation = page.locator("#new-collection-modal");
        await creation.getByLabel("Label", { exact: true }).fill("Editorial");
        await Promise.all([
            page.waitForURL((url) => /\/admin\/collections\/site:[^/]+\/overview$/u.test(url.pathname)),
            creation.getByRole("button", { name: "Create collection", exact: true }).click(),
        ]);
        await page.getByRole("heading", { name: "Editorial", exact: true }).waitFor();
        const collectionId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-2)!).slice(5);

        await page.getByRole("button", { name: "Collection settings", exact: true }).click();
        const settings = page.locator("#collection-settings-modal");
        await settings.getByLabel("Label", { exact: true }).fill("Editorial library");
        await settings.getByRole("button", { name: "Save collection", exact: true }).click();
        await page.getByRole("heading", { name: "Editorial library", exact: true }).waitFor();

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

test("the landing imports a collection without routing through the removed Blocs page", async () => {
    const { browser, page, errors, gotoCollection } = await fixture();
    try {
        await gotoCollection();
        const card = page.locator("p9r-card", { has: page.getByRole("heading", { name: "additional", exact: true }) });
        await card.getByRole("button", { name: "Import collection", exact: true }).click();
        await page.waitForURL((url) => /\/admin\/collections\/managed:[^/]+\/overview$/u.test(url.pathname));
        expect(new URL(page.url()).pathname).not.toContain("/admin/blocs");
        await gotoCollection();
        await page.getByRole("heading", { name: "additional", exact: true }).waitFor();
        expect(await page.locator(".collection-explore-card").count()).toBe(2);
        expect(await page.getByRole("link", { name: "Open collection", exact: true }).count()).toBe(2);
        expect(await page.getByRole("button", { name: "Import collection", exact: true }).count()).toBe(0);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20_000);

test("overview checks and applies a compatible collection update", async () => {
    const { browser, page, errors, writes, gotoCollection, integrationInstallations } = await fixture();
    try {
        await gotoCollection("/admin/collections/managed%3Agallery/overview");
        await page.getByRole("button", { name: "Check updates", exact: true }).click();
        const modal = page.locator("#collection-updates-modal");
        await modal.locator("[data-upgrade-status]").getByText("Installed: 1.2.3", { exact: false }).waitFor();
        await page.getByLabel("Type the target version to confirm", { exact: true }).fill("1.3.0");
        await page.getByRole("button", { name: "Upgrade", exact: true }).click();

        await page.getByText("Upgraded to 1.3.0", { exact: false }).waitFor();
        expect((await integrationInstallations.get("gallery"))?.definitionVersion).toBe("1.3.0");
        expect(writes).toContainEqual({
            path: "/api/integrations/installations/upgrade",
            body: { version: "1.3.0" },
        });
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

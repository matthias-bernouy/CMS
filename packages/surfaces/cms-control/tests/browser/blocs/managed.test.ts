import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("managed selection survives filtering, failed saves and retry while retaining undisplayed resources", async () => {
    const f = await fixture();
    try {
        await f.goto("?collection=managed:gallery");
        const card = f.page.locator('cms-bloc-choice[resource="gallery/blocs/card"] w13c-switch');
        await card.waitFor();
        expect(await card.evaluate((el) => (el as HTMLElement & { checked: boolean }).checked)).toBe(true);
        await card.click();
        await f.page.getByText("1 unsaved change", { exact: true }).waitFor();
        await f.page.locator('p9r-input[cms-param-sync="search"] input').fill("banner");
        await f.page.getByText("1 of 2 blocs", { exact: true }).waitFor();
        const banner = f.page.locator('cms-bloc-choice[resource="gallery/blocs/banner"] w13c-switch');
        await banner.click();
        await f.page.getByText("2 unsaved changes", { exact: true }).waitFor();
        f.failures.set("/api/bloc/collections/availability", "Maintenance, please retry");
        await f.page.getByRole("button", { name: "Save changes", exact: true }).click();
        await f.page.locator("p9r-alert").filter({ hasText: "Maintenance, please retry" }).waitFor();
        await f.page.getByRole("button", { name: "Save changes", exact: true }).click();
        await f.page.waitForFunction(() => !document.querySelector("[data-save-bar]:not([hidden])"));
        expect((await f.integrationInstallations.get("gallery"))?.activeResources?.sort()).toEqual([
            "gallery/blocs/banner",
            "gallery/blocs/retained",
        ]);
        expect(f.writes.filter(({ path }) => path === "/api/bloc/collections/availability")).toHaveLength(2);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 60000);

test("managed collection can deselect every resource, import another collection and apply an update", async () => {
    const f = await fixture();
    try {
        const installed = (await f.integrationInstallations.get("gallery"))!;
        await f.integrationInstallations.replace({ ...installed, activeResources: ["gallery/blocs/card"] });
        await f.goto("?collection=managed:gallery");
        await f.page.locator('cms-bloc-choice[resource="gallery/blocs/card"] w13c-switch').click();
        await f.page.getByRole("button", { name: "Save changes", exact: true }).click();
        await f.page.waitForFunction(() => !document.querySelector("[data-save-bar]:not([hidden])"));
        expect((await f.integrationInstallations.get("gallery"))?.activeResources).toEqual([]);
        expect(f.writes.find(({ path }) => path === "/api/bloc/collections/availability")?.body).toEqual({});
        await f.page.getByRole("button", { name: "Check for updates", exact: true }).click();
        const updates = f.page.locator("#collection-updates-modal");
        await updates.getByRole("button", { name: "Update collection", exact: true }).click();
        await f.page.locator("p9r-tag").filter({ hasText: "Version 1.3.0" }).waitFor();
        expect(f.writes.find(({ path }) => path === "/api/integrations/installations/upgrade")?.body).toEqual({
            version: "1.3.0",
        });
        await f.goto("?view=add");
        await f.page.getByRole("button", { name: "Import collection", exact: true }).click();
        await f.page.waitForURL((url) => (url.searchParams.get("collection") ?? "").startsWith("managed:additional"));
        expect(f.writes.find(({ path }) => path === "/api/integrations/import")?.body).toEqual({ kind: "additional" });
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 60000);

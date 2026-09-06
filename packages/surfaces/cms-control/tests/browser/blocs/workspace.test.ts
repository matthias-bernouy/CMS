import { expect, test } from "bun:test";
import { seedBloc } from "../../control/site-blocs/fixtures";
import { base, fixture } from "./fixture";

test("Blocs uses the official secondary navigation and declarative collection filters in light DOM", async () => {
    const f = await fixture();
    try {
        await f.goto();
        await f.page.getByRole("heading", { name: "Explore collections", exact: true }).waitFor();
        const nav = f.page.locator('w13c-lateral-menu[aria-label="Bloc collections"]');
        expect(await nav.getAttribute("slot")).toBe("secondary-lateral-nav");
        expect(await f.page.locator("cms-bloc-library").evaluate((el) => el.shadowRoot === null)).toBe(true);
        expect(await f.page.locator("cms-binding-core").count()).toBe(1);
        expect(
            await f.page.locator("cms-bloc-library").evaluate((el) => el.querySelectorAll("style, [style]").length),
        ).toBe(0);
        await nav.getByRole("link", { name: /gallery/ }).click();
        await f.page.getByRole("heading", { name: "gallery", exact: true }).waitFor();
        expect(await nav.locator("[active]").count()).toBe(1);
        await f.page.locator('p9r-input[cms-param-sync="search"] input').fill("banner");
        await f.page.waitForFunction(() => location.search.includes("search=banner"));
        await f.page.getByText("1 of 2 blocs", { exact: true }).waitFor();
        await f.page.reload({ waitUntil: "domcontentloaded" });
        await f.page.getByText("1 of 2 blocs", { exact: true }).waitFor();
        expect(await f.page.locator('p9r-input[cms-param-sync="search"] input').inputValue()).toBe("banner");
        await f.page.setViewportSize({ width: 390, height: 844 });
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 60000);

test("site collection and composition forms create through real handlers and preserve the base path", async () => {
    const f = await fixture();
    try {
        await f.goto("?view=add");
        await f.page.getByRole("button", { name: "Create private collection", exact: true }).click();
        const modal = f.page.locator("#new-collection-modal");
        await modal.locator('p9r-input[name="name"] input').fill("Editorial");
        await modal.getByRole("button", { name: "Create private collection", exact: true }).click();
        await f.page.waitForURL(
            (url) =>
                url.pathname === `${base}/admin/blocs` &&
                (url.searchParams.get("collection") ?? "").startsWith("site:"),
        );
        await f.page.getByRole("heading", { name: "Editorial", exact: true }).waitFor();
        const collectionId = new URL(f.page.url()).searchParams.get("collection")!.slice(5);
        expect((await f.repository.getSiteBlocCollections()).some(({ id }) => id === collectionId)).toBe(true);
        await f.page.getByRole("button", { name: "New composition", exact: true }).click();
        const composition = f.page.locator("#new-composition-modal");
        await composition.locator('p9r-input[name="name"] input').fill("Editorial introduction");
        await composition.getByRole("button", { name: "Create and open editor", exact: true }).click();
        await f.page.waitForURL((url) => url.pathname === `${base}/editor/bloc` && Boolean(url.searchParams.get("id")));
        const write = f.writes.find(({ path }) => path === "/api/site-bloc")!;
        expect(write.body).toMatchObject({ name: "Editorial introduction", collectionId });
        expect(write.body.tag).toBeUndefined();
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 60000);

test("private collection settings persist a label and icon without changing its ID", async () => {
    const f = await fixture();
    try {
        await f.goto("?collection=site:site");
        await f.page.getByRole("button", { name: "Collection settings", exact: true }).click();
        const modal = f.page.locator("#collection-settings-modal");
        await modal.locator('p9r-input[name="name"] input').fill("Our compositions");
        await modal.locator('p9r-select[name="icon"]').getByRole("combobox").click();
        await modal.getByRole("option", { name: "Layers", exact: true }).click();
        await modal.getByRole("button", { name: "Save collection", exact: true }).click();
        await f.page.getByRole("heading", { name: "Our compositions", exact: true }).waitFor();
        expect((await f.repository.getSiteBlocCollections()).filter(({ id }) => id === "site")).toEqual([
            {
                id: "site",
                name: "Our compositions",
                description: "Compositions created for this site.",
                icon: "layers",
            },
        ]);
        expect(new URL(f.page.url()).searchParams.get("collection")).toBe("site:site");
        expect(await f.page.locator('[aria-label="Bloc collections"] cms-library-icon[name="layers"]').count()).toBe(1);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);

test("long collections scroll inside the admin while both navigation areas stay in the viewport", async () => {
    const f = await fixture();
    try {
        for (let index = 0; index < 24; index++) {
            await seedBloc(f.repository, `long-${index}`, {
                group: "Long category",
                ownership: {
                    kind: "integration",
                    installationId: "gallery",
                    integrationKind: "gallery",
                    definitionVersion: "1.2.3",
                },
            });
        }
        await f.goto("?collection=managed:gallery");
        await f.page.locator('[data-category="Long category"]').waitFor();
        for (const viewport of [
            { width: 1440, height: 1000 },
            { width: 390, height: 844 },
        ]) {
            await f.page.setViewportSize(viewport);
            await f.page.mouse.move(viewport.width - 70, viewport.height - 120);
            await f.page.mouse.wheel(0, 100000);
            await f.page.mouse.wheel(0, 100000);
            await f.page.waitForFunction(() => {
                const layout = document
                    .querySelector("w13c-fixed-admin-layout")!
                    .shadowRoot!.querySelector("w13c-left-menu-layout")!;
                return layout.shadowRoot!.querySelector("main")!.scrollTop > 0;
            });
            expect(
                await f.page.evaluate(() => ({
                    y: scrollY,
                    width: document.documentElement.scrollWidth,
                    height: document.documentElement.scrollHeight,
                })),
            ).toEqual({ y: 0, width: viewport.width, height: viewport.height });
            expect((await f.page.locator("w13c-fixed-admin-layout").boundingBox())?.y).toBe(0);
        }
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);

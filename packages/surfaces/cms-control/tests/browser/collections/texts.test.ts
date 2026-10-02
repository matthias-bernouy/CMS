import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import installed from "cms-control/api/_content/collections/installed.get";
import saveTexts from "cms-control/api/_content/collections/texts.put";

const sourceRoot = resolve(import.meta.dir, "../../../src");
const bundle = await Bun.file(`${sourceRoot}/static/assets/control-components.js`).text();
const collectionRoot = resolve(import.meta.dir, "../../../../../official-repository/collections/ulvia-official");
const release = {
    ...(await Bun.file(resolve(collectionRoot, "definition.json")).json()),
    translations: {
        en: await Bun.file(resolve(collectionRoot, "translations/en.json")).json(),
    },
    blocs: [],
    assets: [],
    texts: [
        ...(await Bun.file(resolve(collectionRoot, "texts/storefront.json")).json()),
        ...(await Bun.file(resolve(collectionRoot, "texts/support.json")).json()),
    ],
};

test("installed texts keep drafts across groups, persist overrides, reset and reject stale saves", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(release);
    await store.install("site", artifact.digest, 0);
    const cms = {
        auth: { getSubject: async () => ({ identifier: "local:admin" }) },
        config: { administrator: async () => true, collections: { store, siteId: "site" } },
        repository: { getSystem: async () => ({ site: { language: "", additionalLanguages: ["fr"] } }) },
        cache: { delete: () => {}, deleteMatching: () => {} },
    } as never;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(6000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path === "/bundle.js") {
                await route.fulfill({ contentType: "text/javascript; charset=utf-8", body: bundle });
            } else if (path.startsWith("/cms/api/collections/")) {
                const request = new Request(route.request().url(), {
                    method: route.request().method(),
                    ...(route.request().postData() ? { body: route.request().postData() } : {}),
                });
                try {
                    const response = await (path.endsWith("/texts") ? saveTexts : installed)(request, cms);
                    await route.fulfill({
                        status: response.status,
                        body: await response.text(),
                        contentType: "application/json",
                    });
                } catch (error) {
                    await route.fulfill({ status: (error as { status?: number }).status ?? 500, body: String(error) });
                }
            } else {
                await route.fulfill({
                    contentType: "text/html; charset=utf-8",
                    body: '<meta name="basePath" content="/cms"><cms-installed-texts collection-id="ulvia-official"></cms-installed-texts><script src="/bundle.js"></script>',
                });
            }
        });
        await page.goto("http://cms.test/texts");
        const panel = page.locator("cms-installed-texts");
        const welcome = panel.locator('w13c-lateral-menu-item[aria-label="Welcome"]');
        await welcome.click();
        expect(await panel.getByRole("columnheader").allTextContents()).toEqual([
            "Key",
            "Label",
            "Default · English",
            "French",
        ]);
        const title = panel.locator('p9r-textarea[data-id="title"]').getByRole("textbox");
        await title.fill("Bonjour Test");
        await panel.locator('w13c-lateral-menu-item[aria-label="Navigation"]').click();
        await welcome.click();
        expect(await title.inputValue()).toBe("Bonjour Test");
        await panel.getByRole("button", { name: "Save translations", exact: true }).click();
        await panel.getByText("Translations saved.", { exact: true }).waitFor();
        expect((await store.snapshot("site")).collections[0]!.textOverrides.title?.fr).toBe("Bonjour Test");
        await page.reload();
        await welcome.click();
        expect(await title.inputValue()).toBe("Bonjour Test");
        await panel
            .locator('tr:has(p9r-textarea[data-id="title"])')
            .getByRole("button", { name: "Use collection default" })
            .click();
        await panel.getByRole("button", { name: "Save translations", exact: true }).click();
        await panel.getByText("Translations saved.", { exact: true }).waitFor();
        expect((await store.snapshot("site")).collections[0]!.textOverrides.title?.fr).toBeUndefined();
        const snapshot = await store.snapshot("site");
        await store.saveTexts("site", "ulvia-official", snapshot.revision, { title: { fr: "Concurrent edit" } });
        await title.fill("Stale edit");
        await panel.getByRole("button", { name: "Save translations", exact: true }).click();
        await panel.getByText("The collection changed. Reload before saving.", { exact: false }).waitFor();
        expect((await store.snapshot("site")).collections[0]!.textOverrides.title?.fr).toBe("Concurrent edit");
        expect(await title.inputValue()).toBe("Stale edit");
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30000);

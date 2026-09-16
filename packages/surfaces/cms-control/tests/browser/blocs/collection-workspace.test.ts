import { expect, test } from "bun:test";
import { installCollectionDefinition } from "../../control/bloc-library/fixtures";
import { fixture } from "./fixture";

test("collection routes expose overview, theme, blocs and texts from one workspace", async () => {
    const { browser, page, errors, gotoCollection } = await fixture();
    const unresolvedPreviewRequests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes("%7B%7B")) {
            unresolvedPreviewRequests.push(request.url());
        }
    });
    try {
        await gotoCollection("/admin/collections/managed%3Agallery/overview");
        const adminNavigation = page
            .locator("w13c-fixed-admin-layout")
            .locator('w13c-lateral-menu[aria-label="Admin navigation"]');
        expect(await adminNavigation.getByRole("link", { name: "Collections", exact: true }).getAttribute("href")).toBe(
            "/tenant/cms/admin/collections",
        );
        expect(await adminNavigation.getByRole("link", { name: "Theme", exact: true }).count()).toBe(0);
        expect(await adminNavigation.getByRole("link", { name: "Blocs", exact: true }).count()).toBe(0);
        const sectionTab = (section: string) =>
            page.locator(`[data-collection-section="${section}"]`).getByRole("link");
        await sectionTab("overview").waitFor();
        expect(await sectionTab("overview").getAttribute("aria-label")).toBe("Overview");
        expect(await sectionTab("theme").getAttribute("aria-label")).toBe("Theme");
        expect(
            await page
                .locator('w13c-lateral-menu[aria-label="Collections navigation"]')
                .getByRole("link", { name: "gallery", exact: true })
                .count(),
        ).toBe(1);
        expect(await page.locator('cms-shell-detail[size="md"] cms-shell-detail-body').count()).toBe(1);
        expect(await sectionTab("overview").getAttribute("aria-current")).toBe("page");
        expect(await sectionTab("blocs").getAttribute("href")).toBe(
            "/tenant/cms/admin/collections/managed%3Agallery/blocs",
        );
        expect(await page.getByRole("link", { name: /Blocks/ }).count()).toBe(0);
        expect(await page.locator("cms-collection-workspace").innerText()).toContain("Inherited from Ulvia");
        expect(await page.getByText("At a glance", { exact: true }).count()).toBe(0);
        expect(await page.getByRole("button", { name: "Check updates", exact: true }).count()).toBe(1);

        await sectionTab("theme").click();
        await page.waitForURL("**/admin/collections/managed%3Agallery/theme");
        await page.getByText("No resolved theme tokens", { exact: true }).waitFor();

        await sectionTab("blocs").click();
        await page.waitForURL("**/admin/collections/managed%3Agallery/blocs");
        const blocNavigation = page.locator('w13c-lateral-menu[aria-label="Collection blocs"]');
        await blocNavigation.waitFor();
        const detailShell = page.locator('cms-shell-detail[size="full"]');
        const detailBody = detailShell.locator("cms-shell-detail-body[tabbed]:not([contained])");
        expect(await detailBody.count()).toBe(1);
        expect(
            await page
                .locator("w13c-fixed-admin-layout")
                .evaluate(
                    (layout) => getComputedStyle(layout.shadowRoot!.querySelector(".admin-page-chrome")!).position,
                ),
        ).toBe("sticky");
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
                    document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
            ),
        ).toBe(true);
        await page.setViewportSize({ width: 1_920, height: 1_000 });
        await page.waitForFunction(() => !document.querySelector("cms-shell-detail-body")?.hasAttribute("compact"));
        expect(await blocNavigation.getByRole("button", { name: "Content 1", exact: true }).count()).toBe(1);
        expect(
            await blocNavigation
                .locator('w13c-lateral-menu-section[label="Content"]')
                .evaluate((section) => getComputedStyle(section.shadowRoot!.querySelector("button")!).position),
        ).toBe("sticky");
        const preview = page.locator("cms-bloc-preview");
        const availability = detailShell.locator('[slot="actions"] .collection-availability');
        expect(await availability.count()).toBe(1);
        expect(await page.locator('cms-detail-section[slot="aside"] .collection-availability').count()).toBe(0);
        expect(await availability.locator("[data-availability-note]").isVisible()).toBe(false);
        expect(await detailShell.locator(':scope > [slot="title"]').textContent()).toBe("gallery-card");
        expect(await detailShell.locator(':scope > [slot="description"]').textContent()).toBe(
            "gallery-card description",
        );
        expect(
            await detailShell.evaluate((shell) => {
                const header = shell.shadowRoot!.querySelector(".shell-detail-header")!.getBoundingClientRect();
                const body = shell.querySelector("cms-shell-detail-body")!.getBoundingClientRect();
                const regions = ["left-aside", "main", "aside"].map((slot) =>
                    shell
                        .querySelector<HTMLElement>(`cms-shell-detail-body > [slot="${slot}"]`)!
                        .getBoundingClientRect(),
                );
                return {
                    gap: body.top - header.bottom,
                    sameWidth: Math.abs(header.width - body.width) < 1,
                    alignedRegions: regions.every((region) => Math.abs(region.top - regions[0]!.top) < 1),
                };
            }),
        ).toEqual({ gap: 16, sameWidth: true, alignedRegions: true });
        expect(await preview.getAttribute("src")).toBe("/tenant/cms/api/bloc/preview?id=gallery-card");
        expect(await preview.getAttribute("layout")).toBe("auto");
        await page.waitForFunction(
            () => (document.querySelector("cms-bloc-preview") as HTMLElement | null)?.dataset.previewLayout,
        );
        expect(await preview.getAttribute("data-preview-layout")).toBe("compact");
        expect(await preview.evaluate((element) => getComputedStyle(element).paddingInlineStart)).toBe("24px");
        expect(
            await preview.evaluate(
                (element) => element.shadowRoot!.querySelector("iframe")!.getBoundingClientRect().height,
            ),
        ).toBe(220);
        const previewFrame = page.frames().find((frame) => frame.url().includes("/api/bloc/preview"));
        expect(previewFrame).toBeDefined();
        await previewFrame!.evaluate(() => {
            parent.postMessage({ type: "cms:bloc-preview-layout", layout: "page", height: 1_200 }, "*");
        });
        await page.waitForFunction(
            () => document.querySelector("cms-bloc-preview")?.getAttribute("data-preview-layout") === "page",
        );
        expect(
            await preview.evaluate((element) => {
                const frameBounds = element.shadowRoot!.querySelector("iframe")!.getBoundingClientRect();
                return frameBounds.height;
            }),
        ).toBe(1_200);
        await previewFrame!.evaluate(() => {
            parent.postMessage({ type: "cms:bloc-preview-layout", layout: "compact", height: 220 }, "*");
        });
        await page.waitForFunction(
            () =>
                document.querySelector("cms-bloc-preview")?.shadowRoot?.querySelector("iframe")?.getBoundingClientRect()
                    .height === 220,
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await previewFrame!.evaluate(() => {
            parent.postMessage({ type: "cms:bloc-preview-layout", layout: "page", height: 1_200 }, "*");
        });
        await page.waitForFunction(
            () =>
                document.querySelector("cms-bloc-preview")?.shadowRoot?.querySelector("iframe")?.getBoundingClientRect()
                    .height === 1_200,
        );
        expect(await preview.evaluate((element) => getComputedStyle(element).paddingInlineStart)).toBe("16px");
        await page.setViewportSize({ width: 1_440, height: 1_000 });
        await previewFrame!.evaluate(() => {
            parent.postMessage({ type: "cms:bloc-preview-layout", layout: "compact", height: 220 }, "*");
        });
        await page.waitForFunction(
            () =>
                document.querySelector("cms-bloc-preview")?.shadowRoot?.querySelector("iframe")?.getBoundingClientRect()
                    .height === 220,
        );
        expect(await preview.getAttribute("surface")).toBe("canvas");
        expect(await preview.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe("none");
        expect(await preview.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
        expect(
            await preview.evaluate(
                (element) => getComputedStyle(element.shadowRoot!.querySelector("iframe")!).boxShadow,
            ),
        ).not.toBe("none");
        expect(await preview.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
        const search = blocNavigation.locator("p9r-input[data-collection-nav-search]");
        await search.locator("input").fill("banner");
        const retainedSelection = blocNavigation.locator(
            'w13c-lateral-menu-item[data-collection-nav-name="gallery-card"]',
        );
        expect(await retainedSelection.isVisible()).toBe(true);
        expect(await retainedSelection.getAttribute("data-search-current")).not.toBeNull();
        expect(await blocNavigation.getByRole("link", { name: "gallery-banner", exact: true }).count()).toBe(1);
        await search.locator("input").fill("");
        expect(await blocNavigation.getByRole("link", { name: "gallery-card", exact: true }).count()).toBe(1);
        const defaultsTab = detailBody.getByRole("tab", { name: "Defaults", exact: true });
        await defaultsTab.click();
        await page.getByText("Alignment", { exact: true }).waitFor();
        const inspector = page.locator('cms-detail-section[slot="aside"]');
        expect(await inspector.getAttribute("appearance")).toBe("plain");
        expect(await inspector.getAttribute("heading")).toBe("Defaults");
        expect(
            await detailBody.evaluate(
                (body) => getComputedStyle(body.shadowRoot!.querySelector(".shell-detail-aside")!).overflowY,
            ),
        ).not.toBe("auto");
        expect(
            await detailBody.evaluate(
                (body) => getComputedStyle(body.shadowRoot!.querySelector(".shell-detail-aside")!).position,
            ),
        ).not.toBe("sticky");
        expect(await page.getByText("Default values", { exact: true }).count()).toBe(0);
        expect(
            await inspector.evaluate(
                (element) => getComputedStyle(element.shadowRoot!.querySelector(".section")!).borderTopWidth,
            ),
        ).toBe("0px");
        expect(
            await inspector.evaluate(
                (element) => getComputedStyle(element.shadowRoot!.querySelector(".header")!).display,
            ),
        ).toBe("none");
        expect(await page.locator(".bloc-defaults-group[open] summary").allTextContents()).toEqual(["Style3"]);
        expect(await page.getByText("Tone", { exact: true }).count()).toBe(1);
        expect(await page.getByText("accent", { exact: true }).count()).toBe(1);
        expect(await page.getByText("center", { exact: true }).count()).toBe(1);
        expect(await page.getByText("Visible", { exact: true }).count()).toBe(1);
        expect(await page.getByText("Compact", { exact: true }).count()).toBe(1);
        expect(await page.getByText("On", { exact: true }).count()).toBe(2);
        expect(await page.getByText("Available", { exact: true }).count()).toBe(0);
        expect(
            await page
                .locator(".bloc-defaults div")
                .first()
                .evaluate((element) => getComputedStyle(element).borderBottomWidth),
        ).toBe("0px");

        await blocNavigation.getByRole("button", { name: "Layout 1", exact: true }).click();
        await blocNavigation.getByRole("link", { name: "gallery-banner", exact: true }).click();
        await page.waitForURL("**/admin/collections/managed%3Agallery/blocs?bloc=gallery-banner");
        expect(
            await blocNavigation.getByRole("button", { name: "Layout 1", exact: true }).getAttribute("aria-expanded"),
        ).toBe("true");
        expect(await page.locator("cms-bloc-preview").getAttribute("src")).toBe(
            "/tenant/cms/api/bloc/preview?id=gallery-banner",
        );
        expect(await detailBody.getByRole("tab", { name: "Defaults", exact: true }).count()).toBe(0);
        expect(await page.locator("cms-bloc-defaults:not([hidden])").count()).toBe(0);
        expect(await page.getByText("No explicit attribute values.", { exact: false }).count()).toBe(0);

        await sectionTab("texts").click();
        await page.waitForURL("**/admin/collections/managed%3Agallery/texts");
        const textsShell = page.locator("cms-shell-detail", {
            has: page.locator('w13c-lateral-menu[aria-label="Text themes"]'),
        });
        await textsShell.getByText("Checkout", { exact: true }).first().waitFor();
        expect(await textsShell.getByRole("button", { name: "Save translation", exact: true }).isDisabled()).toBe(true);
        const textNavigation = textsShell.locator('w13c-lateral-menu[aria-label="Text themes"]');
        expect(await textNavigation.count()).toBe(1);
        expect(await textNavigation.getByRole("link", { name: "Checkout", exact: true }).count()).toBe(1);
        expect(await textsShell.getByText("Default language", { exact: true }).count()).toBe(1);
        expect(await textsShell.getByText("English", { exact: true }).count()).toBe(1);
        expect(await textsShell.locator('p9r-select[label="Translation language"]').getAttribute("value")).toBe("fr");
        expect(await textsShell.locator(".collection-text-table thead th").allTextContents()).toEqual([
            "Label",
            "Default · English",
            "Français",
        ]);
        expect(await textsShell.locator(".collection-text-table tbody tr").count()).toBe(3);
        expect(await textsShell.locator('[slot="left-aside"]').count()).toBe(1);
        expect(await textsShell.locator('[slot="aside"]').count()).toBe(0);
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoCollection("/admin/collections/managed%3Agallery/texts");
        expect(await page.getByRole("button", { name: "Admin", exact: true }).count()).toBe(1);
        expect(await page.getByRole("button", { name: "Collections", exact: true }).count()).toBe(1);
        const activeTab = page.locator('[data-collection-section="texts"]');
        await activeTab.waitFor();
        expect(
            await activeTab.evaluate((tab) => {
                const bounds = tab.getBoundingClientRect();
                const navigation = tab.parentElement!.getBoundingClientRect();
                return bounds.left >= navigation.left && bounds.right <= navigation.right;
            }),
        ).toBe(true);
        expect(
            await page
                .getByRole("navigation", { name: "Collection sections" })
                .evaluate((navigation) => navigation.scrollWidth <= navigation.clientWidth + 1),
        ).toBe(true);
        await page.setViewportSize({ width: 320, height: 844 });
        await gotoCollection("/admin/collections/managed%3Agallery/texts");
        expect(
            await page
                .getByRole("navigation", { name: "Collection sections" })
                .evaluate((navigation) => navigation.scrollWidth <= navigation.clientWidth + 1),
        ).toBe(true);
        expect(unresolvedPreviewRequests).toEqual([]);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20000);

test("an empty collection does not reserve navigation or defaults chrome", async () => {
    const context = await fixture();
    const { browser, page, errors, gotoCollection } = context;
    try {
        await installCollectionDefinition(context, "empty", {
            ...context.definition,
            kind: "empty",
            label: "empty",
            resources: [],
            artifacts: [],
        });
        await gotoCollection("/admin/collections/managed%3Aempty/blocs");
        await page.getByText("No blocs in this collection", { exact: true }).waitFor();
        expect(await page.getByText("This collection does not provide any blocs.", { exact: true }).count()).toBe(1);
        const body = page.locator("cms-shell-detail-body");

        expect(await page.getByRole("searchbox", { name: "Search blocs" }).count()).toBe(0);
        expect(await body.getAttribute("has-left-aside")).toBeNull();
        expect(await body.getAttribute("has-aside")).toBeNull();
        expect(await body.getByRole("tab", { name: "Defaults", exact: true }).count()).toBe(0);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

test("a collection bloc can leave the editor catalogue without removing its installed artifact", async () => {
    const { browser, page, errors, writes, gotoCollection, integrationInstallations, repository } = await fixture();
    try {
        await gotoCollection("/admin/collections/managed%3Agallery/blocs?bloc=gallery-card");
        const choice = page.locator('cms-bloc-choice[resource="gallery/blocs/card"]');
        const toggle = choice.locator("w13c-switch");
        const availabilityNote = page.locator("[data-availability-note]");
        await toggle.waitFor();
        expect(await toggle.evaluate((element) => (element as HTMLElement & { checked: boolean }).checked)).toBe(true);
        expect(await availabilityNote.isVisible()).toBe(false);

        await toggle.click();
        await page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
        expect(await availabilityNote.isVisible()).toBe(true);

        expect(writes).toContainEqual({
            path: "/api/bloc/collections/availability",
            body: { id: "gallery", resource: "gallery/blocs/card", active: "false" },
        });
        expect((await integrationInstallations.get("gallery"))?.activeResources).not.toContain("gallery/blocs/card");
        expect((await repository.getBlocRecord("gallery-card"))?.artifact).not.toBeNull();
        await page.locator("cms-shell-detail-body").getByRole("tab", { name: "Preview", exact: true }).click();
        expect(await page.locator("cms-bloc-preview").isVisible()).toBe(true);
        expect(await page.getByRole("link", { name: "gallery-card", exact: true }).count()).toBe(1);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 15000);

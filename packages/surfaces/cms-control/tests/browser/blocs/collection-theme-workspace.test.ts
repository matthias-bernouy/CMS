import { expect, test } from "bun:test";

import { collectionDefinition, installCollectionDefinition } from "../../control/bloc-library/fixtures";
import { fixture } from "./fixture";

test("theme tokens use grouped navigation, a live preview and editable values", async () => {
    const context = await fixture();
    const { browser, page, errors, writes } = context;
    try {
        const ulvia = collectionDefinition("ulvia");
        ulvia.label = "Ulvia";
        ulvia.theme = {
            preview: {
                kind: "interface",
                bindings: {
                    page: "page-background",
                    surface: "surface-background",
                    subtle: "subtle-background",
                    heading: "surface-text",
                    body: "body-text",
                    muted: "surface-muted-text",
                    border: "surface-border",
                    accent: "primary-base",
                    "accent-foreground": "primary-foreground",
                    "accent-muted": "primary-muted",
                    "accent-contrasted": "primary-contrasted",
                    danger: "danger-muted",
                },
            },
            categories: [brandCategory(), surfacesCategory(), feedbackCategory()],
        };
        await installCollectionDefinition(context, "ulvia", ulvia);
        const gallery = structuredClone(context.definition);
        gallery.theme = { dependencies: [{ kind: "ulvia", versionRange: "^1.0.0" }], categories: [] };
        await installCollectionDefinition(context, "gallery", gallery);

        await page.setViewportSize({ width: 1_920, height: 1_000 });
        await context.gotoCollection("/admin/collections/managed%3Agallery/theme");
        const menu = page.locator('w13c-lateral-menu[aria-label="Theme tokens"]');
        const shell = page.locator('cms-shell-detail[size="full"]');
        const specimen = page.locator("cms-theme-specimen");
        await specimen.waitFor();

        expect(await menu.getByRole("button", { name: "Brand 4", exact: true }).count()).toBe(1);
        expect(await menu.getByRole("button", { name: "Surfaces 7", exact: true }).count()).toBe(1);
        expect(
            await menu.locator('w13c-lateral-menu-item[data-collection-nav-name="Overview"]').getAttribute("active"),
        ).not.toBeNull();
        expect(await shell.locator(':scope > [slot="title"]').textContent()).toBe("Theme overview");
        expect(await page.getByText("Theme groups", { exact: true }).count()).toBe(0);
        expect(await specimen.getAttribute("view")).toBe("overview");
        expect(await specimen.getAttribute("data-mode")).toBe("compare");
        expect(await specimen.locator('[data-theme-panel="light"]:not([hidden])').count()).toBe(1);
        expect(await specimen.locator('[data-theme-panel="dark"]:not([hidden])').count()).toBe(1);
        expect(
            await specimen
                .locator('[data-theme-panel="light"]')
                .evaluate((panel) => panel.style.getPropertyValue("--ulvia-primary-base")),
        ).toBe("#16634d");
        expect(await specimen.locator("[data-selected-token]").count()).toBe(0);
        expect(await page.locator('cms-detail-section[slot="aside"]').count()).toBe(0);

        const search = menu.getByRole("searchbox", { name: "Search tokens" });
        await search.fill("danger");
        expect(await menu.getByRole("link", { name: "Danger", exact: true }).isVisible()).toBe(true);
        expect(await menu.getByRole("link", { name: "Primary", exact: true }).isVisible()).toBe(false);
        await search.fill("");

        await menu.getByRole("button", { name: "Brand 4", exact: true }).click();
        await menu.getByRole("link", { name: "Primary", exact: true }).click();
        await page.waitForURL("**/theme?token=ulvia-primary-base");
        expect(await shell.locator(':scope > [slot="title"]').textContent()).toBe("Primary");
        expect(await specimen.getAttribute("view")).toBe("focus");
        expect(await specimen.locator("[data-selected-token]").count()).toBeGreaterThan(0);

        const inspector = page.locator('cms-detail-section[slot="aside"]');
        const editor = inspector.locator("cms-theme-token-editor");
        const save = shell.getByRole("button", { name: "Save", exact: true });
        expect(await editor.getAttribute("default-source")).toBe("Ulvia");
        expect(await inspector.innerText()).not.toContain("Inherited from Ulvia");
        expect(await inspector.innerText()).not.toContain("--ulvia-primary-base");
        await editor.waitFor();
        expect(await save.getAttribute("disabled")).not.toBeNull();
        const valueMode = editor.locator("[data-value-mode]");
        expect(await valueMode.evaluate((control: HTMLElement & { value: string }) => control.value)).toBe("light");
        expect(await editor.locator('[data-theme-mode="light"]:not([hidden])').count()).toBe(1);
        expect(await editor.locator('[data-theme-mode="dark"][hidden]').count()).toBe(1);

        const lightValue = editor.locator('[data-theme-mode="light"] [data-token-value-control]');
        expect(await lightValue.evaluate((control: HTMLElement & { value: string }) => control.value)).toBe("#16634d");
        await lightValue.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "#224466";
            control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
        expect(await save.getAttribute("disabled")).toBeNull();
        expect(
            await specimen
                .locator('[data-theme-panel="light"]')
                .evaluate((panel) => panel.style.getPropertyValue("--ulvia-primary-base")),
        ).toBe("#224466");
        await save.click();
        await editor.getByText("Saved.", { exact: true }).waitFor();
        await page.waitForFunction(() =>
            document.querySelector<HTMLElement>("[data-theme-save]")?.hasAttribute("disabled"),
        );
        const savedTheme = writes.findLast(({ path }) => path === "/api/system/settings")?.body.theme as {
            themes: Array<{ id: string; values: { light: Record<string, string> } }>;
            activeThemeId: string;
        };
        expect(savedTheme.themes.find(({ id }) => id === savedTheme.activeThemeId)?.values.light).toMatchObject({
            "ulvia-primary-base": "#224466",
        });

        const lightMode = editor.locator('[data-theme-mode="light"] [data-token-input-mode]');
        await lightMode.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "reference";
            control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
        const reference = editor.locator(
            '[data-theme-mode="light"] [data-reference-editor] [data-token-value-control]',
        );
        await reference.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "var(--ulvia-primary-muted)";
            control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
        expect(
            await specimen
                .locator('[data-theme-panel="light"]')
                .evaluate((panel) => panel.style.getPropertyValue("--ulvia-primary-base")),
        ).toBe("#e2f0ea");
        await save.click();
        await editor.getByText("Saved.", { exact: true }).waitFor();
        const referencedTheme = writes.findLast(({ path }) => path === "/api/system/settings")?.body.theme as {
            themes: Array<{ id: string; values: { light: Record<string, string> } }>;
            activeThemeId: string;
        };
        expect(
            referencedTheme.themes.find(({ id }) => id === referencedTheme.activeThemeId)?.values.light,
        ).toMatchObject({
            "ulvia-primary-base": "var(--ulvia-primary-muted)",
        });

        const reset = editor.locator('[data-theme-mode="light"] [data-reset-token]');
        expect(await reset.innerText()).toBe("Reset to Ulvia default");
        await reset.click();
        expect(await save.getAttribute("disabled")).toBeNull();
        expect(
            await specimen
                .locator('[data-theme-panel="light"]')
                .evaluate((panel) => panel.style.getPropertyValue("--ulvia-primary-base")),
        ).toBe("#16634d");
        await save.click();
        await editor.getByText("Saved.", { exact: true }).waitFor();
        const resetTheme = writes.findLast(({ path }) => path === "/api/system/settings")?.body.theme as {
            themes: Array<{ id: string; values: { light: Record<string, string> } }>;
            activeThemeId: string;
        };
        expect(resetTheme.themes.find(({ id }) => id === resetTheme.activeThemeId)?.values.light).not.toHaveProperty(
            "ulvia-primary-base",
        );

        await specimen.getByRole("button", { name: "Dark", exact: true }).click();
        expect(await specimen.getAttribute("data-mode")).toBe("dark");
        expect(await specimen.locator('[data-theme-panel="light"][hidden]').count()).toBe(1);
        expect(await specimen.locator('[data-theme-panel="dark"]:not([hidden])').count()).toBe(1);

        await menu.getByRole("button", { name: "Feedback 1", exact: true }).click();
        await menu.getByRole("link", { name: "Danger", exact: true }).click();
        await page.waitForURL("**/theme?token=ulvia-danger-muted");
        expect(await specimen.getAttribute("data-mode")).toBe("dark");
        expect(await shell.locator(':scope > [slot="title"]').textContent()).toBe("Danger");
        await valueMode.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "dark";
        });
        expect(await editor.locator('[data-theme-mode="light"][hidden]').count()).toBe(1);
        expect(await editor.locator('[data-theme-mode="dark"]:not([hidden])').count()).toBe(1);
        const darkFallback = editor.locator("[data-dark-fallback]");
        await darkFallback.waitFor({ state: "visible" });
        expect(await darkFallback.innerText()).toContain("Uses the Light value by default.");
        expect(await editor.locator('[data-mode-controls="dark"][hidden]').count()).toBe(1);
        await darkFallback.getByRole("button", { name: "Define a separate value", exact: true }).click();
        expect(await darkFallback.getAttribute("hidden")).not.toBeNull();
        expect(await editor.locator('[data-mode-controls="dark"]:not([hidden])').count()).toBe(1);
        await editor.locator('[data-theme-mode="dark"] [data-reset-token]').click();
        expect(await darkFallback.getAttribute("hidden")).toBeNull();
        await specimen.getByRole("button", { name: "Compare", exact: true }).click();
        expect(await specimen.locator("[data-theme-panel]:not([hidden])").count()).toBe(1);
        expect(await specimen.locator('[data-theme-panel="light"] .mode-label').textContent()).toBe("Light and dark");
        expect(
            await specimen.evaluate((host) => {
                const canvas = host.shadowRoot!.querySelector(".canvas")!.getBoundingClientRect();
                const panel = host.shadowRoot!.querySelector('[data-theme-panel="light"]')!.getBoundingClientRect();
                return Math.abs(panel.width - (canvas.width - 48)) < 1;
            }),
        ).toBe(true);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector("cms-shell-detail-body")?.hasAttribute("compact"));
        const compactToggle = menu.locator(".embedded-toggle");
        expect(await compactToggle.locator("span").innerText()).toBe("Danger");
        expect(await compactToggle.getAttribute("aria-label")).toBe("Danger");
        expect(await shell.getByRole("tab", { name: "Preview", exact: true }).count()).toBe(1);
        expect(await shell.getByRole("tab", { name: "Values", exact: true }).count()).toBe(1);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 25_000);

test("theme profiles and site variables stay in the collection theme context", async () => {
    const context = await fixture();
    const { browser, page, errors } = context;
    try {
        const ulvia = collectionDefinition("ulvia");
        ulvia.label = "Ulvia";
        ulvia.theme = { categories: [brandCategory()] };
        await installCollectionDefinition(context, "ulvia", ulvia);
        const gallery = structuredClone(context.definition);
        gallery.theme = { dependencies: [{ kind: "ulvia", versionRange: "^1.0.0" }], categories: [] };
        await installCollectionDefinition(context, "gallery", gallery);

        await context.gotoCollection("/admin/collections/managed%3Agallery/theme");
        const shell = page.locator('cms-shell-detail[size="full"]');
        const actions = shell.locator('p9r-action-menu[label="Theme actions"]');
        await actions.getByRole("button", { name: "Theme actions", exact: true }).click();
        await actions.getByRole("menuitem", { name: "New theme", exact: true }).click();
        const profileModal = page.locator("[data-theme-profile-modal]");
        await profileModal.getByLabel("Name", { exact: true }).fill("Night campaign");
        await profileModal.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("theme") === "theme-2");
        expect(await shell.locator("p9r-tag").filter({ hasText: "Draft" }).count()).toBe(1);

        await actions.getByRole("button", { name: "Theme actions", exact: true }).click();
        await actions.getByRole("menuitem", { name: "Activate theme", exact: true }).click();
        await page.waitForLoadState("domcontentloaded");
        await shell.locator("p9r-tag").filter({ hasText: "Active" }).waitFor();

        await actions.getByRole("button", { name: "Theme actions", exact: true }).click();
        await actions.getByRole("menuitem", { name: "Manage site variables", exact: true }).click();
        const catalog = page.locator("[data-site-variable-catalog-modal]");
        await catalog.getByRole("heading", { name: "Variables", exact: true }).waitFor();
        await catalog.getByRole("button", { name: "Add variable", exact: true }).click();
        const editor = page.locator("[data-site-variable-editor-modal]");
        await editor.getByLabel("Name", { exact: true }).fill("Campaign accent");
        await editor.getByLabel("Description", { exact: true }).fill("Accent shared with campaign blocs.");
        await editor.getByRole("button", { name: "Create", exact: true }).click();
        await catalog.getByText("Campaign accent", { exact: true }).waitFor();
        await catalog.locator("[data-site-variable-catalog-close]").click();

        const navigation = page.locator('w13c-lateral-menu[aria-label="Theme tokens"]');
        await navigation.getByRole("button", { name: "Site · Variables 1", exact: true }).click();
        await navigation.getByRole("link", { name: "Campaign accent", exact: true }).click();
        await page.waitForURL("**/theme?token=site-variable-1");
        expect(await page.locator("cms-theme-token-editor").getAttribute("default-source")).toBe("Site variables");
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 25_000);

function brandCategory() {
    return {
        id: "brand",
        label: "Brand",
        description: "Primary and secondary colors.",
        tokens: [
            token("primary-base", "Primary", "#16634d", "#66d3ad"),
            token("primary-foreground", "Primary foreground", "#ffffff", "#10231d"),
            token("primary-muted", "Primary muted", "#e2f0ea", "#173c31"),
            token("primary-contrasted", "Primary contrasted", "#164534", "#b9f5df"),
        ],
    };
}

function surfacesCategory() {
    return {
        id: "surfaces",
        label: "Surfaces",
        description: "Page and content colors.",
        tokens: [
            token("page-background", "Page background", "#f9f7f1", "#151815"),
            token("surface-background", "Surface background", "#ffffff", "#1d211e"),
            token("subtle-background", "Subtle background", "#f4f2ec", "#252b27"),
            token("surface-text", "Surface text", "#26261f", "#f2f4ef"),
            token("body-text", "Body text", "#3f3e38", "#d7dbd4"),
            token("surface-muted-text", "Muted text", "#6d6b63", "#a8afa6"),
            token("surface-border", "Surface border", "#dfddd4", "#3a423c"),
        ],
    };
}

function feedbackCategory() {
    return {
        id: "feedback",
        label: "Feedback",
        description: "Semantic feedback colors.",
        tokens: [token("danger-muted", "Danger", "#fde9e7")],
    };
}

function token(id: string, label: string, light: string, dark?: string) {
    return {
        id,
        label,
        description: `${label} token`,
        type: "color" as const,
        defaults: { light, ...(dark ? { dark } : {}) },
    };
}

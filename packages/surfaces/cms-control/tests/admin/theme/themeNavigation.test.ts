import { describe, expect, test } from "bun:test";
import type { ThemeSource } from "@bernouy/cms-content";
import { renderThemeNav, sourceNavigationLabel } from "cms-control/components/admin/Theme/nav/view";

describe("theme navigation", () => {
    test("separates site tokens from integration-owned catalogues", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), { sourceId: "colors", categoryId: "brand" });

        const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-theme-group]"));
        expect(groups.map((item) => item.dataset.themeGroup)).toEqual(["site", "integrations"]);
        expect(groups.map((item) => item.textContent)).toEqual(["Site", "Integrations"]);
        expect(root.querySelector("[data-source='spacing']")?.textContent).toBe("Spacing & layout");
        expect(root.querySelector("[data-source='site-brand']")?.textContent).toBe("Site tokens");
        expect(root.querySelector("[data-source='other']")?.textContent).toBe("Imported CSS");
        expect(root.querySelector("[data-source='integration-photo-albums']")?.textContent).toBe("Photo Albums");
        expect(root.textContent).not.toContain("Other");
        expect(root.textContent).not.toContain("Custom");
    });

    test("keeps site categories available but presents each integration as one entry", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), {
            sourceId: "integration-photo-albums",
            categoryId: "gallery",
        });

        expect(root.querySelector("[data-source='integration-photo-albums'][active]")).not.toBeNull();
        expect(root.querySelector("[data-category][data-source='integration-photo-albums']")).toBeNull();

        renderThemeNav(root, sources(), { sourceId: "colors", categoryId: "surfaces" });

        expect(root.querySelector("[data-category='brand']")?.textContent).toContain("Brand");
        expect(root.querySelector("[data-category='surfaces'][active]")?.textContent).toContain("Surfaces");
        expect(root.querySelector("[data-category][data-source='other']")).toBeNull();
    });

    test("uses ownership for site labels while recognizing legacy imported sources", () => {
        expect(sourceNavigationLabel(siteSource("design-system", "Design system"))).toBe("Site tokens");
        expect(sourceNavigationLabel(siteSource("existing-css", "Legacy variables"))).toBe("Imported CSS");
        expect(sourceNavigationLabel(siteSource("other", "Other"))).toBe("Imported CSS");
        expect(sourceNavigationLabel(siteSource("custom", "Custom"))).toBe("Imported CSS");
    });
});

function navigationRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<w13c-lateral-menu></w13c-lateral-menu>";
    return root;
}

function sources(): ThemeSource[] {
    return [
        {
            id: "colors",
            label: "Colors",
            supportsModes: true,
            owner: { kind: "core" },
            categories: [category("brand", "Brand"), category("surfaces", "Surfaces")],
        },
        {
            id: "spacing",
            label: "Spacing",
            supportsModes: false,
            owner: { kind: "core" },
            categories: [category("scale", "Scale"), category("layout", "Layout")],
        },
        siteSource("site-brand", "Brand additions"),
        siteSource("other", "Other"),
        {
            id: "integration-photo-albums",
            label: "Photo Albums",
            supportsModes: true,
            owner: { kind: "integration", integrationId: "photo-albums" },
            categories: [category("gallery", "Gallery"), category("viewer", "Viewer")],
        },
        {
            id: "integration-commerce",
            label: "Commerce",
            supportsModes: true,
            owner: { kind: "integration", integrationId: "commerce" },
            categories: [category("catalogue", "Catalogue")],
        },
    ];
}

function siteSource(id: string, label: string): ThemeSource {
    return {
        id,
        label,
        supportsModes: false,
        owner: { kind: "site" },
        categories: [category("general", "General")],
    };
}

function category(id: string, label: string): ThemeSource["categories"][number] {
    return { id, label, description: `${label} tokens.`, tokens: [] };
}

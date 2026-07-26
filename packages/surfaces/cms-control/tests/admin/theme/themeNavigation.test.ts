import { describe, expect, test } from "bun:test";
import type { ThemeSource } from "@bernouy/cms-content";
import { renderThemeNav, sourceNavigationLabel } from "cms-control/components/admin/Theme/nav/view";

describe("theme navigation", () => {
    test("lists ordinary catalogues directly and groups only integration-owned catalogues", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), { sourceId: "colors", categoryId: "brand" });

        const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-theme-group]"));
        expect(groups.map((item) => item.dataset.themeGroup)).toEqual(["integrations"]);
        expect(groups.map((item) => item.textContent)).toEqual(["Integrations"]);
        expect(root.querySelector("[data-source='spacing']")?.textContent).toBe("Spacing & layout");
        expect(root.querySelector("[data-source='site-brand']")?.textContent).toBe("Brand additions");
        expect(root.querySelector("[data-source='other']")?.textContent).toBe("Other");
        expect(root.querySelector("[data-source='integration-photo-albums']")?.textContent).toBe("Photo Albums");
    });

    test("keeps ordinary categories available but presents each integration as one entry", () => {
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

    test("keeps ordinary labels even when an id matches a legacy special case", () => {
        expect(sourceNavigationLabel(ordinarySource("design-system", "Design system"))).toBe("Design system");
        expect(sourceNavigationLabel(ordinarySource("site-tokens", "Legacy site tokens"))).toBe("Legacy site tokens");
        expect(sourceNavigationLabel(ordinarySource("existing-css", "Legacy variables"))).toBe("Legacy variables");
        expect(sourceNavigationLabel(ordinarySource("other", "Other"))).toBe("Other");
        expect(sourceNavigationLabel(ordinarySource("custom", "Custom"))).toBe("Custom");
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
            categories: [category("brand", "Brand"), category("surfaces", "Surfaces")],
        },
        {
            id: "spacing",
            label: "Spacing",
            supportsModes: false,
            categories: [category("scale", "Scale"), category("layout", "Layout")],
        },
        ordinarySource("site-brand", "Brand additions"),
        ordinarySource("other", "Other"),
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

function ordinarySource(id: string, label: string): ThemeSource {
    return {
        id,
        label,
        supportsModes: false,
        categories: [category("general", "General")],
    };
}

function category(id: string, label: string): ThemeSource["categories"][number] {
    return { id, label, description: `${label} tokens.`, tokens: [] };
}

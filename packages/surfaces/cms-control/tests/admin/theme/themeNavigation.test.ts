import { describe, expect, test } from "bun:test";
import type { ThemeSource } from "@bernouy/cms-content";
import { renderThemeNav, sourceNavigationLabel } from "cms-control/components/admin/Theme/nav/view";

describe("theme navigation", () => {
    test("lists every catalogue once without giving ordinary sources an integration label", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), { sourceId: "colors", categoryId: "brand" });

        expect(root.querySelector("[data-theme-group]")).toBeNull();
        expect(root.querySelector("[data-source='spacing']")?.textContent).toBe("Spacing & layout");
        expect(root.querySelector("[data-source='site-brand']")?.textContent).toBe("Brand additions");
        expect(root.querySelector("[data-source='other']")?.textContent).toBe("Other");
        expect(root.querySelector("[data-source='integration-photo-albums']")?.textContent).toBe("Photo Albums");
        expect(root.querySelectorAll("[data-source='integration-photo-albums']:not([data-category])")).toHaveLength(1);
        expect(root.querySelector("[data-source='colors']")?.classList.contains("integration-item")).toBeFalse();
        expect(root.querySelector("[data-source='colors']")?.textContent).not.toContain("Integration");
    });

    test("expands integration categories beneath their unique active parent", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), {
            sourceId: "integration-photo-albums",
            categoryId: "viewer",
        });

        const parent = root.querySelector<HTMLElement>(
            "[data-source='integration-photo-albums']:not([data-category])",
        )!;
        const children = Array.from(
            root.querySelectorAll<HTMLElement>("[data-source='integration-photo-albums'][data-category]"),
        );
        expect(parent.hasAttribute("active")).toBeTrue();
        expect(parent.getAttribute("aria-level")).toBe("1");
        expect(parent.getAttribute("aria-expanded")).toBe("true");
        expect(children.map((item) => item.dataset.category)).toEqual(["gallery", "viewer"]);
        expect(children.every((item) => item.getAttribute("aria-level") === "2")).toBeTrue();
        expect(children.every((item) => item.classList.contains("integration-category"))).toBeTrue();
        expect(children.find((item) => item.dataset.category === "viewer")?.hasAttribute("active")).toBeTrue();
        const entries = Array.from(root.querySelectorAll<HTMLElement>("w13c-lateral-menu-item"));
        const parentIndex = entries.indexOf(parent);
        expect(entries.slice(parentIndex + 1, parentIndex + 3).map((item) => item.dataset.category)).toEqual([
            "gallery",
            "viewer",
        ]);
        expect(root.querySelector("[data-source='integration-commerce'][data-category]")).toBeNull();
        expect(
            root
                .querySelector("[data-source='integration-commerce']:not([data-category])")
                ?.getAttribute("aria-expanded"),
        ).toBe("false");

        renderThemeNav(root, sources(), {
            sourceId: "integration-commerce",
            categoryId: "catalogue",
        });

        expect(root.querySelectorAll("[data-source='integration-commerce'][data-category]")).toHaveLength(1);
        expect(
            root.querySelector("[data-source='integration-commerce'][data-category='catalogue'][active]"),
        ).not.toBeNull();
        expect(root.querySelector("[data-source='integration-photo-albums'][data-category]")).toBeNull();
    });

    test("keeps the existing expansion rules for ordinary categories", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), { sourceId: "colors", categoryId: "surfaces" });

        expect(root.querySelector("[data-category='brand']")?.textContent).toContain("Brand");
        expect(root.querySelector("[data-category='surfaces'][active]")?.textContent).toContain("Surfaces");
        expect(root.querySelector("[data-category='brand']")?.classList.contains("integration-category")).toBeFalse();
        expect(root.querySelector("[data-category][data-source='spacing']")).toBeNull();
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

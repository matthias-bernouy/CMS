import { describe, expect, test } from "bun:test";
import type { ThemeSource } from "@bernouy/cms-content";
import { renderThemeNav } from "cms-control/components/admin/Theme/nav/view";

describe("theme navigation", () => {
    test("lists categories directly without technical source selectors", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), { sourceId: "colors", categoryId: "brand" });

        expect(root.querySelector("[data-source]:not([data-category])")).toBeNull();
        const siteGroup = root.querySelector<HTMLElement>("[data-theme-group='site']")!;
        expect(siteGroup.textContent).toBe("Site");
        expect(siteGroup.querySelector("[slot='icon']")).toBeNull();
        expect(categoryLabel(root, "colors", "brand")).toBe("Brand");
        expect(categoryLabel(root, "colors", "surfaces")).toBe("Surfaces");
        expect(categoryLabel(root, "spacing", "scale")).toBe("Scale");
        expect(categoryLabel(root, "site-brand", "general")).toBe("General");
        expect(
            root.querySelector("[data-source='integration-sample-brand'][data-category='gallery']")?.textContent,
        ).toBe("Gallery");
        expect(root.querySelector("w13c-lateral-menu-item")?.getAttribute("data-source")).toBe("colors");
        const group = root.querySelector<HTMLElement>("[data-theme-group='integration-sample-brand']")!;
        expect(group.tagName).toBe("DIV");
        expect(group.classList.contains("menu-section")).toBeTrue();
        expect(group.textContent).toBe("Sample Brand");
        expect(group.querySelector(".integration-icon svg")).not.toBeNull();
        expect(group.hasAttribute("role")).toBeFalse();
        const siteCategory = root.querySelector("[data-source='site-brand'][data-category='general']")!;
        expect(siteCategory.querySelector("[slot='icon']")).toBeNull();
        expect(siteCategory.querySelector("[data-theme-nav-action='add-variable']")?.ariaLabel).toBe(
            "Add a variable to General",
        );
        expect(siteCategory.querySelector<HTMLElement>("[data-theme-nav-action='add-variable']")?.slot).toBe(
            "quick-actions",
        );
        expect(siteCategory.querySelector<HTMLElement>(".theme-group-actions")?.slot).toBe("more-actions");
        expect(siteCategory.querySelector("[data-theme-nav-action='edit-group']")?.textContent).toBe("Edit group");
        expect(siteCategory.querySelector("[data-theme-nav-action='delete-group']")?.textContent).toBe("Delete group");
        expect(
            root
                .querySelector("[data-source='integration-sample-brand'][data-category='gallery']")
                ?.querySelector("[data-theme-nav-action]"),
        ).toBeNull();
        const newGroup = root.querySelector<HTMLElement>("[data-theme-nav-action='create-group']")!;
        expect(newGroup.textContent).toBe("+ New group");
        expect(newGroup.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(
            Array.from(root.querySelectorAll("w13c-lateral-menu-item")).every(
                (item) => item.querySelector("[slot='icon']") === null,
            ),
        ).toBeTrue();
        expect(siteGroup.compareDocumentPosition(siteCategory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(siteCategory.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(root.textContent).not.toContain("Brand additions");
    });

    test("keeps every category visible and only the exact selection active", () => {
        const root = navigationRoot();

        renderThemeNav(root, sources(), {
            sourceId: "integration-sample-brand",
            categoryId: "viewer",
        });

        const children = Array.from(
            root.querySelectorAll<HTMLElement>("[data-source='integration-sample-brand'][data-category]"),
        );
        expect(children.map((item) => item.dataset.category)).toEqual(["gallery", "viewer"]);
        expect(children.map((item) => item.ariaLabel)).toEqual(["Gallery", "Viewer"]);
        expect(children.every((item) => item.getAttribute("aria-level") === "1")).toBeTrue();
        expect(children.every((item) => item.classList.contains("category-item"))).toBeTrue();
        expect(children.every((item) => !item.classList.contains("grouped-category"))).toBeTrue();
        expect(children.find((item) => item.dataset.category === "viewer")?.hasAttribute("active")).toBeTrue();
        expect(root.querySelector("[data-source='integration-commerce'][data-category='catalogue']")).not.toBeNull();

        renderThemeNav(root, sources(), {
            sourceId: "integration-commerce",
            categoryId: "catalogue",
        });

        expect(root.querySelectorAll("[data-source='integration-commerce'][data-category]")).toHaveLength(1);
        expect(
            root.querySelector("[data-source='integration-commerce'][data-category='catalogue'][active]"),
        ).not.toBeNull();
        expect(
            root.querySelector("[data-source='integration-sample-brand'][data-category='viewer'][active]"),
        ).toBeNull();
    });

    test("prevents deleting the last editable site group", () => {
        const root = navigationRoot();

        renderThemeNav(root, [ordinarySource("custom", "Site variables")], {
            sourceId: "custom",
            categoryId: "general",
        });

        const deletion = root.querySelector<HTMLButtonElement>("[data-theme-nav-action='delete-group']")!;
        expect(deletion.disabled).toBeTrue();
        expect(deletion.title).toBe("Keep at least one site group.");
    });
});

function categoryLabel(root: ParentNode, sourceId: string, categoryId: string): string | null | undefined {
    return root.querySelector(`[data-source='${sourceId}'][data-category='${categoryId}'] [data-theme-category-label]`)
        ?.textContent;
}

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
            id: "integration-sample-brand",
            label: "Sample Brand",
            supportsModes: true,
            owner: { kind: "integration", integrationId: "sample-brand" },
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

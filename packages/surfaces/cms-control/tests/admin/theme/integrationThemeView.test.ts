import { describe, expect, test } from "bun:test";
import { renderThemeEditor } from "cms-control/components/admin/Theme/editor/view";

import {
    integrationThemeEditorRoot as editorRoot,
    integrationThemeFixture as integrationTheme,
} from "./integrationThemeFixture";

describe("integration theme catalogue", () => {
    test("shows provenance while keeping only theme values editable", () => {
        const root = editorRoot();

        renderThemeEditor(root, {
            settings: integrationTheme(),
            selection: { sourceId: "integration-photo-albums", categoryId: "gallery" },
            selectedThemeId: "default",
            mode: "light",
            siteName: "Portfolio",
            canPersist: true,
            tokenFilter: "all",
            tokenSearch: "",
        });

        expect(root.querySelector<HTMLElement>("[data-source-provenance]")!.hidden).toBeFalse();
        expect(root.querySelector("[data-source-owner-label]")?.textContent).toBe("Photo Albums");
        expect(root.querySelector<HTMLElement>("[data-source-owner-label]")?.title).toBe("photo-albums");
        expect(root.querySelector("[data-source-owner-kind]")?.textContent).toBe("Integration");
        expect(root.querySelector<HTMLElement>("[data-add-theme-category]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-add-element]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLButtonElement>("[data-delete-category]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-category-fields]")!.hidden).toBeTrue();
        expect(root.querySelector("[data-token-label]")).toBeNull();
        expect(root.querySelector("[data-delete-token]")).toBeNull();
        expect(root.querySelector(".token-label-text")?.textContent).toBe("Gallery font");
        expect(root.querySelector("[data-token-id='integration-photo-albums-shadow']")).toBeNull();
        expect(root.querySelector("[data-category-section]")?.getAttribute("heading")).toBe("Gallery");
        expect(root.querySelector("[data-category-section]")?.getAttribute("description")).toBe(
            "Gallery presentation.",
        );

        const font = root.querySelector<HTMLInputElement>("[data-token-type='font-family'] [data-value-control]")!;
        expect(font.value).toBe("var(--font-body)");
        expect(font.placeholder).toContain("system-ui");
        expect(font.classList.contains("font-family-control")).toBeTrue();
        expect(
            root.querySelector<HTMLButtonElement>("[data-reset-token='integration-photo-albums-font']")!.disabled,
        ).toBeFalse();

        const accent = root.querySelector<HTMLElement>("[data-token-id='integration-photo-albums-accent']")!;
        expect(accent.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("#336699");
        expect(accent.querySelector<HTMLButtonElement>("[data-reset-token]")!.disabled).toBeTrue();

        renderThemeEditor(root, {
            settings: integrationTheme(),
            selection: { sourceId: "integration-photo-albums", categoryId: "gallery" },
            selectedThemeId: "default",
            mode: "dark",
            siteName: "Portfolio",
            canPersist: true,
            tokenFilter: "all",
            tokenSearch: "",
        });
        expect(
            root.querySelector<HTMLInputElement>("[data-token-type='font-family'] [data-value-control]")!.value,
        ).toBe("system-ui, sans-serif");
        expect(
            root.querySelector<HTMLInputElement>(
                "[data-token-id='integration-photo-albums-accent'] [data-value-control]",
            )!.value,
        ).toBe("#336699");
    });

    test("renders only the selected integration category", () => {
        const root = editorRoot();

        renderThemeEditor(root, {
            settings: integrationTheme(),
            selection: { sourceId: "integration-photo-albums", categoryId: "viewer" },
            selectedThemeId: "default",
            mode: "light",
            siteName: "Portfolio",
            canPersist: true,
            tokenFilter: "all",
            tokenSearch: "",
        });

        expect(root.querySelector("[data-category-title]")?.textContent).toBe("Photo Albums");
        expect(root.querySelector("[data-category-section]")?.getAttribute("heading")).toBe("Viewer");
        expect(root.querySelector("[data-category-section]")?.getAttribute("description")).toBe("Viewer presentation.");
        expect(root.querySelector("[data-token-id='integration-photo-albums-shadow']")).not.toBeNull();
        expect(root.querySelector("[data-token-id='integration-photo-albums-font']")).toBeNull();
        expect(root.querySelectorAll("[data-groups] > .group")).toHaveLength(1);
    });

    test("keeps ordinary catalogues structurally editable without ownership metadata", () => {
        const settings = integrationTheme();
        settings.sources.unshift({
            id: "colors",
            label: "Colors",
            supportsModes: true,
            categories: [
                {
                    id: "brand",
                    label: "Brand",
                    description: "Brand tokens.",
                    tokens: [
                        {
                            id: "brand-color",
                            variable: "brand-color",
                            label: "Brand color",
                            description: "Primary brand color",
                            type: "color",
                        },
                    ],
                },
            ],
        });
        const root = editorRoot();

        renderThemeEditor(root, {
            settings,
            selection: { sourceId: "colors", categoryId: "brand" },
            selectedThemeId: "default",
            mode: "light",
            siteName: "Portfolio",
            canPersist: true,
            tokenFilter: "all",
            tokenSearch: "",
        });

        expect(root.querySelector<HTMLElement>("[data-source-provenance]")!.hidden).toBeTrue();
        expect(root.querySelector("[data-source-provenance]:not([hidden]) [data-source-owner-kind]")).toBeNull();
        expect(root.querySelector<HTMLElement>("[data-add-theme-category]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLElement>("[data-add-element]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLButtonElement>("[data-delete-category]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLButtonElement>("[data-delete-category]")!.disabled).toBeTrue();
        expect(root.querySelector<HTMLButtonElement>("[data-delete-category]")!.title).toBe(
            "Keep at least one editable category.",
        );
        expect(root.querySelector<HTMLElement>("[data-category-fields]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLInputElement>("[data-token-label]")?.value).toBe("Brand color");
        expect(root.querySelector<HTMLButtonElement>("[data-delete-token]")?.ariaLabel).toBe("Delete Brand color");
    });
});

import { describe, expect, test } from "bun:test";
import type { ThemeSettings } from "@bernouy/cms-content";
import { renderThemeEditor } from "cms-control/components/admin/Theme/editor/view";

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
        expect(root.querySelector("[data-source-owner-label]")?.textContent).toContain("photo-albums");
        expect(root.querySelector("[data-source-owner-kind]")?.textContent).toBe("Integration");
        expect(root.querySelector<HTMLElement>("[data-add-theme-category]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-add-element]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-category-fields]")!.hidden).toBeTrue();
        expect(root.querySelector("[data-token-label]")).toBeNull();
        expect(root.querySelector(".token-label-text")?.textContent).toBe("Gallery font");

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
});

function editorRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
        <span data-category-title></span>
        <div data-theme-switch></div>
        <button data-add-theme-category></button><button data-add-element></button>
        <button data-save-theme></button><button data-activate-theme></button>
        <input data-theme-name-input><span data-theme-status></span><span data-site-name></span>
        <div data-source-provenance><span data-source-owner-kind></span><span data-source-owner-label></span><span data-source-owner-note></span></div>
        <div data-mode-switch><button data-mode="light"></button><button data-mode="dark"></button></div>
        <section data-category-section></section>
        <input data-token-search><div data-token-filters></div><div data-groups></div>
        <div data-category-fields><input data-category-label-input><input data-category-description-input></div>
    `;
    return root;
}

function integrationTheme(): ThemeSettings {
    return {
        activeThemeId: "default",
        sources: [
            {
                id: "integration-photo-albums",
                label: "Photo Albums",
                supportsModes: true,
                owner: { kind: "integration", integrationId: "photo-albums" },
                categories: [
                    {
                        id: "gallery",
                        label: "Gallery",
                        description: "Gallery presentation.",
                        tokens: [
                            {
                                id: "integration-photo-albums-font",
                                variable: "integration-photo-albums-font",
                                label: "Gallery font",
                                description: "Titles and captions",
                                type: "font-family",
                                defaults: { light: "Inter, system-ui, sans-serif", dark: "system-ui, sans-serif" },
                            },
                            {
                                id: "integration-photo-albums-accent",
                                variable: "integration-photo-albums-accent",
                                label: "Gallery accent",
                                description: "Selected media",
                                type: "color",
                                defaults: { light: "#336699" },
                            },
                        ],
                    },
                ],
            },
        ],
        themes: [
            {
                id: "default",
                name: "Default",
                values: {
                    light: { "integration-photo-albums-font": "var(--font-body)" },
                    dark: {},
                },
            },
        ],
    };
}

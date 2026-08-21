import { describe, expect, test } from "bun:test";
import type { ThemeSettings } from "@bernouy/cms-content";
import { CmsThemeEditor } from "cms-control/components/admin/Theme/ThemeEditor";
import { renderThemeEditor } from "cms-control/components/admin/Theme/editor/view";

import {
    integrationThemeEditorRoot as editorRoot,
    integrationThemeFixture as integrationTheme,
} from "./integrationThemeFixture";

describe("integration theme catalogue", () => {
    test("keeps group management out of the content panel", () => {
        const root = new CmsThemeEditor().shadowRoot!;
        const context = root.querySelector(".theme-page-header")!;
        const category = root.querySelector("[data-category-section]")!;

        expect(context.querySelector("[data-theme-switch]")).not.toBeNull();
        expect(context.querySelector("[data-mode-switch]")).not.toBeNull();
        expect(context.querySelector("[data-save-theme]")).not.toBeNull();
        expect(context.querySelector("[data-theme-switch][label]")).toBeNull();
        expect(context.querySelector("[data-mode-switch][label]")).toBeNull();
        expect(root.querySelector("[data-add-theme-category], [data-add-element], [data-edit-category]")).toBeNull();
        expect(root.textContent).not.toContain("Add token");
        expect(root.querySelector("[data-context-modal]")).not.toBeNull();
        expect(root.querySelector("[data-context-name]")?.tagName).toBe("P9R-INPUT");
        expect(root.querySelector("[data-context-description]")?.tagName).toBe("P9R-TEXTAREA");
        expect(root.querySelector("[data-variable-name]")?.tagName).toBe("P9R-INPUT");
        expect(root.querySelector("[data-variable-description]")?.tagName).toBe("P9R-TEXTAREA");
        expect(root.querySelector("[data-variable-type]")?.tagName).toBe("P9R-SELECT");
        expect(root.querySelector("[data-variable-edit-name]")?.tagName).toBe("P9R-INPUT");
        expect(root.querySelector("[data-variable-edit-description]")?.tagName).toBe("P9R-TEXTAREA");
        expect(root.querySelector("[data-variable-edit-type]")?.tagName).toBe("P9R-TAG");
        expect(root.querySelector("[data-variable-edit-modal] [data-delete-token]")).not.toBeNull();
    });

    test("keeps the integration contract fixed while making its values easy to edit", () => {
        const root = editorRoot();

        renderThemeEditor(root, viewState(integrationTheme(), "gallery"));

        expect(root.querySelector("[data-source-title]")?.textContent).toBe("Photo Albums");
        expect(root.querySelector("[data-token-label]")).toBeNull();
        expect(root.querySelector("[data-edit-token]")).toBeNull();
        expect(root.querySelector("[data-delete-token]")).toBeNull();
        expect(root.querySelector(".token-label-text")?.textContent).toBe("Gallery font");
        expect(root.querySelector("[data-token-id='integration-photo-albums-shadow']")).toBeNull();
        expect(root.querySelector("[data-category-section]")?.getAttribute("heading")).toBe("Gallery");
        expect(root.querySelector("[data-category-section]")?.getAttribute("description")).toBe(
            "Gallery presentation.",
        );
        expect(root.querySelector<HTMLElement>("[data-theme-switch]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLElement>("[data-mode-note]")!.hidden).toBeTrue();
        expect(root.querySelector("[data-theme-switch]")?.getAttribute("value")).toBe("default");

        const font = valueControl(root, "[data-token-type='font-family']");
        expect(font.value).toBe("var(--font-body)");
        expect(font.getAttribute("placeholder")).toBe("Select a variable");
        expect(font.querySelector("option")?.textContent).toBe("Unavailable reference");
        expect(font.textContent).not.toContain("--font-body");
        expect(font.hasAttribute("invalid")).toBeTrue();
        expect(root.querySelector("[data-reset-token='integration-photo-albums-font']")).not.toBeNull();

        const accent = root.querySelector<HTMLElement>("[data-token-id='integration-photo-albums-accent']")!;
        expect(valueControl(accent).value).toBe("#336699");
        expect(accent.querySelector("[data-reset-token]")).toBeNull();
        expect(accent.querySelector("[data-edit-token]")).toBeNull();
        expect(accent.textContent).not.toContain("integration-photo-albums-accent");
    });

    test("switches groups and modes without rendering unrelated tokens", () => {
        const root = editorRoot();
        const settings = integrationTheme();

        renderThemeEditor(root, viewState(settings, "viewer"));

        expect(root.querySelector("[data-category-section]")?.getAttribute("heading")).toBe("Viewer");
        expect(root.querySelector("[data-token-id='integration-photo-albums-shadow']")).not.toBeNull();
        expect(root.querySelector("[data-token-id='integration-photo-albums-font']")).toBeNull();
        expect(root.querySelectorAll("[data-groups] > .group")).toHaveLength(1);

        renderThemeEditor(root, viewState(settings, "gallery", "dark"));
        const darkFont = valueControl(root, "[data-token-type='font-family']");
        expect(darkFont.value).toBe("system-ui, sans-serif");
        expect(darkFont.getAttribute("placeholder")).toBe("Choose or enter a font stack");
        expect(valueControl(root, "[data-token-id='integration-photo-albums-accent']").value).toBe("#336699");
    });

    test("keeps the global dark context while editing a mode-independent source", () => {
        const root = editorRoot();
        const settings = integrationTheme();
        settings.sources.unshift({
            id: "shared",
            label: "Shared variables",
            supportsModes: false,
            categories: [
                {
                    id: "general",
                    label: "General",
                    description: "Shared in both modes.",
                    tokens: [
                        {
                            id: "shared-value",
                            variable: "shared-value",
                            label: "Shared value",
                            description: "One value for both modes",
                            type: "color",
                        },
                    ],
                },
            ],
        });
        settings.themes[0]!.values.light["shared-value"] = "#123456";

        const retainedMode = renderThemeEditor(root, viewState(settings, "general", "dark", "shared"));

        expect(retainedMode).toBe("dark");
        expect((root.querySelector("[data-mode-switch]") as HTMLElement & { value: string }).value).toBe("dark");
        expect(root.querySelector<HTMLElement>("[data-mode-note]")!.hidden).toBeFalse();
        expect(valueControl(root, "[data-token-id='shared-value']").value).toBe("#123456");
    });

    test("exposes the selected theme to the custom selector after options are rebuilt", () => {
        const root = editorRoot();
        const settings = integrationTheme();
        settings.themes.push({ id: "alternate", name: "Alternate", values: { light: {}, dark: {} } });

        renderThemeEditor(root, { ...viewState(settings, "gallery"), selectedThemeId: "alternate" });

        const selector = root.querySelector<HTMLElement>("[data-theme-switch]")!;
        expect(selector.hidden).toBeFalse();
        expect(selector.getAttribute("value")).toBe("alternate");
        expect(Array.from(selector.querySelectorAll("option"), (option) => option.value)).toEqual([
            "default",
            "alternate",
        ]);
    });

    test("keeps site catalogues structurally editable", () => {
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

        renderThemeEditor(root, viewState(settings, "brand", "light", "colors"));

        expect(root.querySelector("[data-token-label-text]")?.textContent).toBe("Brand color");
        expect(root.querySelector("[data-token-description-text]")?.textContent).toBe("Primary brand color");
        expect(root.querySelector("[data-token-type-label]")?.textContent).toBe("Color");
        expect(root.querySelector<HTMLButtonElement>("[data-edit-token]")?.ariaLabel).toBe("Edit Brand color");
        expect(root.querySelector("[data-token-id='brand-color'] [data-delete-token]")).toBeNull();
    });
});

function viewState(
    settings: ThemeSettings,
    categoryId: string,
    mode: "light" | "dark" = "light",
    sourceId = "integration-photo-albums",
) {
    return {
        settings,
        selection: { sourceId, categoryId },
        selectedThemeId: "default",
        mode,
    };
}

function valueControl(root: ParentNode, rowSelector = ""): HTMLElement & { value: string } {
    const selector = rowSelector ? `${rowSelector} [data-token-value-control]` : "[data-token-value-control]";
    return root.querySelector(selector) as HTMLElement & { value: string };
}

import { describe, expect, test } from "bun:test";
import type { ThemeSettings } from "@bernouy/cms-content";
import { renderThemeEditor } from "cms-control/components/admin/Theme/editor/view";

import {
    integrationThemeEditorRoot as editorRoot,
    integrationThemeFixture as integrationTheme,
} from "./integrationThemeFixture";

describe("integration theme catalogue", () => {
    test("keeps the integration contract fixed while making its values easy to edit", () => {
        const root = editorRoot();

        renderThemeEditor(root, viewState(integrationTheme(), "gallery"));

        expect(root.querySelector("[data-source-title]")?.textContent).toBe("Photo Albums");
        expect(root.querySelector<HTMLElement>("[data-category-actions]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-category-fields]")!.hidden).toBeTrue();
        expect(root.querySelector("[data-token-label]")).toBeNull();
        expect(root.querySelector("[data-delete-token]")).toBeNull();
        expect(root.querySelector(".token-label-text")?.textContent).toBe("Gallery font");
        expect(root.querySelector("[data-token-id='integration-photo-albums-shadow']")).toBeNull();
        expect(root.querySelector("[data-category-section]")?.getAttribute("heading")).toBe("Gallery");
        expect(root.querySelector("[data-category-section]")?.getAttribute("description")).toBe(
            "Gallery presentation.",
        );
        expect(root.querySelector<HTMLElement>("[data-theme-switch]")!.hidden).toBeTrue();
        expect(root.querySelector("[data-theme-switch]")?.getAttribute("value")).toBe("default");

        const font = valueControl(root, "[data-token-type='font-family']");
        expect(font.value).toBe("var(--font-body)");
        expect(font.getAttribute("placeholder")).toContain("system-ui");
        expect(font.classList.contains("font-family-control")).toBeTrue();
        expect(root.querySelector("[data-reset-token='integration-photo-albums-font']")).not.toBeNull();

        const accent = root.querySelector<HTMLElement>("[data-token-id='integration-photo-albums-accent']")!;
        expect(valueControl(accent).value).toBe("#336699");
        expect(accent.querySelector("[data-reset-token]")).toBeNull();
        expect(accent.querySelector(".token-details code")?.textContent).toBe("var(--integration-photo-albums-accent)");
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
        expect(valueControl(root, "[data-token-type='font-family']").value).toBe("system-ui, sans-serif");
        expect(valueControl(root, "[data-token-id='integration-photo-albums-accent']").value).toBe("#336699");
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

        expect(root.querySelector<HTMLElement>("[data-category-actions]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLElement>("[data-category-fields]")!.hidden).toBeFalse();
        expect(root.querySelector<HTMLElement>("[data-delete-category]")!.hasAttribute("disabled")).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-delete-category]")!.title).toBe(
            "Keep at least one editable group.",
        );
        expect(root.querySelector<HTMLInputElement>("[data-token-label]")?.value).toBe("Brand color");
        expect(root.querySelector<HTMLButtonElement>("[data-delete-token]")?.ariaLabel).toBe("Delete Brand color");
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

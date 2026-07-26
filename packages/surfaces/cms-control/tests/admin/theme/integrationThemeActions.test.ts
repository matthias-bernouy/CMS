import { describe, expect, test } from "bun:test";
import { defaultThemeSettings, type ThemeSettings } from "@bernouy/cms-content";
import { handleThemeInput } from "cms-control/components/admin/Theme/editor/controller/inputEvents";
import { themeSettingsFromCss } from "cms-control/components/admin/Theme/editor/importCss";
import {
    addCategory,
    addToken,
    removeCategory,
    removeToken,
    resetIntegrationTokenValue,
} from "cms-control/components/admin/Theme/editor/model";

describe("integration theme editor actions", () => {
    test("rejects catalogue edits while accepting CSS variable overrides", () => {
        const settings = fixture();
        const selection = { sourceId: "integration-demo", categoryId: "surface" };
        const root = eventRoot();
        root.addEventListener("input", (event) =>
            handleThemeInput(event, { root, settings, selection, selectedThemeId: "default", mode: "light" }),
        );

        const label = root.querySelector<HTMLInputElement>("[data-token-label]")!;
        label.value = "Compromised label";
        label.dispatchEvent(new Event("input", { bubbles: true }));
        const value = root.querySelector<HTMLInputElement>("[data-value-control]")!;
        value.value = "var(--primary-base)";
        value.dispatchEvent(new Event("input", { bubbles: true }));

        expect(settings.sources[0]!.categories[0]!.tokens[0]!.label).toBe("Accent");
        expect(settings.themes[0]!.values.light["integration-demo-accent"]).toBe("var(--primary-base)");
        expect(addCategory(settings, selection)).toBeUndefined();
        addToken(settings, selection);
        expect(settings.sources[0]!.categories[0]!.tokens).toHaveLength(1);
        expect(removeToken(settings, selection, "integration-demo-accent")).toBeFalse();
        expect(removeCategory(settings, selection)).toBeUndefined();
    });

    test("resets overrides to provider defaults by removing them", () => {
        const settings = fixture();
        const selection = { sourceId: "integration-demo", categoryId: "surface" };

        expect(
            resetIntegrationTokenValue(settings, selection, "default", "light", "integration-demo-accent"),
        ).toBeTrue();
        expect(settings.themes[0]!.values.light).not.toHaveProperty("integration-demo-accent");
        expect(
            resetIntegrationTokenValue(settings, selection, "default", "light", "integration-demo-accent"),
        ).toBeFalse();
    });

    test("allows catalogue creation in every ordinary source", () => {
        const settings = defaultThemeSettings();
        const colors = { sourceId: "colors", categoryId: "brand" };
        const added = addCategory(settings, colors)!;
        addToken(settings, { sourceId: added.sourceId, categoryId: added.category.id });

        expect(added.category.tokens).toHaveLength(1);
        expect(added.category.description).toBe("Theme tokens for Colors.");
        expect(added.category.tokens[0]).toMatchObject({
            id: expect.stringMatching(/^token-/),
            type: "value",
            description: "New theme token",
        });
    });

    test("keeps fallback CSS imports aligned with referenced token types", () => {
        const settings = themeSettingsFromCss(":root { --space-md: 1rem; --custom-gap: var(--space-md); }");
        const tokens = settings.sources.flatMap((source) => source.categories.flatMap((category) => category.tokens));

        expect(settings.sources).toHaveLength(1);
        expect(settings.sources[0]).toMatchObject({ id: "imported-css", label: "Imported CSS" });
        expect(settings.sources[0]!.owner).toBeUndefined();
        expect(tokens.find((token) => token.id === "space-md")?.type).toBe("length");
        expect(tokens.find((token) => token.id === "custom-gap")?.type).toBe("length");
    });

    test("removes ordinary tokens and their values from every theme and mode", () => {
        const settings = defaultThemeSettings();
        settings.themes.push({
            id: "alternate",
            name: "Alternate",
            values: { light: { "primary-base": "#000000" }, dark: { "primary-base": "#ffffff" } },
        });

        expect(removeToken(settings, { sourceId: "colors", categoryId: "brand" }, "primary-base")).toBeTrue();
        expect(
            settings.sources
                .find((source) => source.id === "colors")!
                .categories[0]!.tokens.some((token) => token.id === "primary-base"),
        ).toBeFalse();
        for (const theme of settings.themes) {
            expect(theme.values.light).not.toHaveProperty("primary-base");
            expect(theme.values.dark).not.toHaveProperty("primary-base");
        }
    });

    test("removes ordinary categories, cleans values and selects a remaining category", () => {
        const settings = defaultThemeSettings();
        const removed = removeCategory(settings, { sourceId: "colors", categoryId: "brand" });

        expect(removed).toEqual({
            sourceId: "colors",
            categoryId: "brand",
            sourceRemoved: false,
            selection: { sourceId: "colors", categoryId: "surfaces" },
        });
        expect(settings.sources.find((source) => source.id === "colors")!.categories[0]!.id).toBe("surfaces");
        expect(settings.themes[0]!.values.light).not.toHaveProperty("primary-base");
    });

    test("does not mutate when deleting a category would leave no valid destination", () => {
        const settings = themeSettingsFromCss(":root { --brand-color: #123456; }");
        settings.sources.push({
            id: "empty",
            label: "Empty",
            supportsModes: false,
            categories: [],
        });
        settings.sources.push({
            id: "integration-demo",
            label: "Demo",
            supportsModes: false,
            owner: { kind: "integration", integrationId: "demo" },
            categories: [{ id: "general", label: "General", description: "Demo tokens.", tokens: [] }],
        });
        const before = structuredClone(settings);

        expect(removeCategory(settings, { sourceId: "imported-css", categoryId: "general" })).toBeUndefined();
        expect(settings).toEqual(before);
    });
});

function eventRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
        <span data-category-title></span><section data-category-section></section><span data-category-description></span>
        <div data-token-id="integration-demo-accent">
            <input data-token-label><input data-value-control>
        </div>
    `;
    return root;
}

function fixture(): ThemeSettings {
    return {
        activeThemeId: "default",
        sources: [
            {
                id: "integration-demo",
                label: "Demo",
                supportsModes: false,
                owner: { kind: "integration", integrationId: "demo" },
                categories: [
                    {
                        id: "surface",
                        label: "Surface",
                        description: "Demo surface.",
                        tokens: [
                            {
                                id: "integration-demo-accent",
                                variable: "integration-demo-accent",
                                label: "Accent",
                                description: "Demo accent",
                                type: "color",
                                defaults: { light: "#123456" },
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
                values: { light: { "integration-demo-accent": "#654321" }, dark: {} },
            },
        ],
    };
}

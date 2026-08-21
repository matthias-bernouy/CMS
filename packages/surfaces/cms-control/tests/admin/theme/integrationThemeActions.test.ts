import { describe, expect, test } from "bun:test";
import { defaultThemeSettings, type ThemeSettings } from "@bernouy/cms-content";
import { handleThemeInput } from "cms-control/components/admin/Theme/editor/controller/inputEvents";
import {
    addCategory,
    addTheme,
    addToken,
    removeCategory,
    removeToken,
    resetTokenValue,
    renameTheme,
    updateCategory,
    updateToken,
} from "cms-control/components/admin/Theme/editor/model";

describe("integration theme editor actions", () => {
    test("rejects catalogue edits while accepting CSS variable overrides", () => {
        const settings = fixture();
        const selection = { sourceId: "integration-demo", categoryId: "surface" };
        const root = eventRoot();
        root.addEventListener("input", (event) =>
            handleThemeInput(event, { root, settings, selection, selectedThemeId: "default", mode: "light" }),
        );

        const value = root.querySelector<HTMLInputElement>("[data-value-control]")!;
        value.value = "var(--primary-base)";
        value.dispatchEvent(new Event("input", { bubbles: true }));

        expect(settings.sources[0]!.categories[0]!.tokens[0]!.label).toBe("Accent");
        expect(settings.themes[0]!.values.light["integration-demo-accent"]).toBe("var(--primary-base)");
        expect(updateToken(settings, selection, "integration-demo-accent", "Compromised label", "Changed")).toBeFalse();
        expect(addCategory(settings, selection)).toBeUndefined();
        addToken(settings, selection);
        expect(settings.sources[0]!.categories[0]!.tokens).toHaveLength(1);
        expect(removeToken(settings, selection, "integration-demo-accent")).toBeFalse();
        expect(removeCategory(settings, selection)).toBeUndefined();
    });

    test("resets overrides to provider defaults by removing them", () => {
        const settings = fixture();
        const selection = { sourceId: "integration-demo", categoryId: "surface" };

        expect(resetTokenValue(settings, selection, "default", "light", "integration-demo-accent")).toBeTrue();
        expect(settings.themes[0]!.values.light).not.toHaveProperty("integration-demo-accent");
        expect(resetTokenValue(settings, selection, "default", "light", "integration-demo-accent")).toBeFalse();
    });

    test("resets a site token when its catalogue declares a default", () => {
        const settings = defaultThemeSettings();
        seedCustomToken(settings, { defaults: { light: "#000000" } });
        settings.themes[0]!.values.light["custom-accent"] = "#123456";

        expect(
            resetTokenValue(
                settings,
                { sourceId: "custom", categoryId: "variables" },
                "default",
                "light",
                "custom-accent",
            ),
        ).toBeTrue();
        expect(settings.themes[0]!.values.light).not.toHaveProperty("custom-accent");
    });

    test("allows catalogue creation in every ordinary source", () => {
        const settings = defaultThemeSettings();
        const custom = { sourceId: "custom", categoryId: "variables" };
        const added = addCategory(settings, custom)!;
        addToken(
            settings,
            { sourceId: added.sourceId, categoryId: added.category.id },
            {
                label: "Campaign accent",
                description: "Accent used by campaign content.",
                type: "color",
            },
        );

        expect(added.category.tokens).toHaveLength(1);
        expect(added.category.description).toBe("Variables for Site variables.");
        expect(added.category.tokens[0]).toMatchObject({
            id: expect.stringMatching(/^variable-/),
            label: "Campaign accent",
            type: "color",
            description: "Accent used by campaign content.",
        });

        const token = added.category.tokens[0]!;
        expect(
            updateToken(
                settings,
                { sourceId: added.sourceId, categoryId: added.category.id },
                token.id,
                "Campaign primary",
                "Primary campaign accent.",
            ),
        ).toBeTrue();
        expect(token).toMatchObject({
            label: "Campaign primary",
            description: "Primary campaign accent.",
            type: "color",
        });
    });

    test("applies names submitted by theme and group dialogs", () => {
        const settings = defaultThemeSettings();
        const themeId = addTheme(settings, "Editorial");
        const added = addCategory(
            settings,
            { sourceId: "custom", categoryId: "variables" },
            "Campaign",
            "Seasonal campaign variables.",
        )!;

        expect(settings.themes.find((theme) => theme.id === themeId)?.name).toBe("Editorial");
        expect(renameTheme(settings, themeId, "Editorial dark")).toBeTrue();
        expect(settings.themes.find((theme) => theme.id === themeId)?.name).toBe("Editorial dark");
        expect(added.category).toMatchObject({
            label: "Campaign",
            description: "Seasonal campaign variables.",
        });
        expect(
            updateCategory(settings, { sourceId: "custom", categoryId: added.category.id }, "Marketing", "Shared."),
        ).toBeDefined();
        expect(added.category).toMatchObject({ label: "Marketing", description: "Shared." });
    });

    test("removes ordinary tokens and their values from every theme and mode", () => {
        const settings = defaultThemeSettings();
        seedCustomToken(settings);
        settings.themes[0]!.values.light["custom-accent"] = "#123456";
        settings.themes.push({
            id: "alternate",
            name: "Alternate",
            values: { light: { "custom-accent": "#000000" }, dark: { "custom-accent": "#ffffff" } },
        });

        expect(removeToken(settings, { sourceId: "custom", categoryId: "variables" }, "custom-accent")).toBeTrue();
        expect(
            settings.sources
                .find((source) => source.id === "custom")!
                .categories[0]!.tokens.some((token) => token.id === "custom-accent"),
        ).toBeFalse();
        for (const theme of settings.themes) {
            expect(theme.values.light).not.toHaveProperty("custom-accent");
            expect(theme.values.dark).not.toHaveProperty("custom-accent");
        }
    });

    test("removes ordinary categories, cleans values and selects a remaining category", () => {
        const settings = defaultThemeSettings();
        seedCustomToken(settings);
        settings.themes[0]!.values.light["custom-accent"] = "#123456";
        const added = addCategory(settings, { sourceId: "custom", categoryId: "variables" })!;
        const removed = removeCategory(settings, { sourceId: "custom", categoryId: "variables" });

        expect(removed).toEqual({
            sourceId: "custom",
            categoryId: "variables",
            sourceRemoved: false,
            selection: { sourceId: "custom", categoryId: added.category.id },
        });
        expect(settings.sources.find((source) => source.id === "custom")!.categories[0]!.id).toBe(added.category.id);
        expect(settings.themes[0]!.values.light).not.toHaveProperty("custom-accent");
    });

    test("does not mutate when deleting a category would leave no valid destination", () => {
        const settings = defaultThemeSettings();
        settings.sources = [{ ...settings.sources[0]!, categories: [settings.sources[0]!.categories[0]!] }];
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

        expect(removeCategory(settings, { sourceId: "custom", categoryId: "variables" })).toBeUndefined();
        expect(settings).toEqual(before);
    });
});

function eventRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<section data-category-section></section>
        <div data-token-id="integration-demo-accent"><input data-value-control></div>`;
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

function seedCustomToken(settings: ThemeSettings, extra: { defaults?: { light: string } } = {}): void {
    settings.sources[0]!.categories[0]!.tokens.push({
        id: "custom-accent",
        variable: "custom-accent",
        label: "Custom accent",
        description: "Site-specific accent",
        type: "color",
        ...extra,
    });
}

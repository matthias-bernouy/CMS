import { describe, expect, test } from "bun:test";
import { defaultThemeSettings, type ThemeSettings } from "@bernouy/cms-content";
import { handleThemeInput } from "cms-control/components/admin/Theme/editor/controller/inputEvents";
import { themeSettingsFromCss } from "cms-control/components/admin/Theme/editor/importCss";
import { addCategory, addToken, resetIntegrationTokenValue } from "cms-control/components/admin/Theme/editor/model";

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

    test("allows catalogue creation only inside the dedicated site source", () => {
        const settings = defaultThemeSettings();
        const colors = { sourceId: "colors", categoryId: "brand" };
        const colorCount = settings.sources[0]!.categories[0]!.tokens.length;

        expect(addCategory(settings, colors)).toBeUndefined();
        addToken(settings, colors);
        expect(settings.sources[0]!.categories[0]!.tokens).toHaveLength(colorCount);

        const site = { sourceId: "site-tokens", categoryId: "general" };
        const added = addCategory(settings, site)!;
        addToken(settings, { sourceId: added.sourceId, categoryId: added.category.id });

        expect(added.category.tokens).toHaveLength(1);
        expect(added.category.tokens[0]).toMatchObject({ type: "value", description: "Custom design token" });
    });

    test("keeps fallback CSS imports aligned with referenced token types", () => {
        const settings = themeSettingsFromCss(":root { --space-md: 1rem; --custom-gap: var(--space-md); }");
        const tokens = settings.sources.flatMap((source) => source.categories.flatMap((category) => category.tokens));

        expect(tokens.find((token) => token.id === "space-md")?.type).toBe("length");
        expect(tokens.find((token) => token.id === "custom-gap")?.type).toBe("length");
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

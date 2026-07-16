import {
    ContentValidationError,
    defaultThemeSettings,
    generateThemeCss,
    organizeThemeSettings,
    themeSettingsFromCss,
    validateThemeSettings,
} from "@bernouy/cms-content";

describe("structured themes", () => {
    test("emits the active theme as CSS custom properties", () => {
        const settings = defaultThemeSettings();
        settings.themes[0]!.values.dark["primary-base"] = "#000000";

        const css = generateThemeCss(settings);

        expect(css).toContain("--primary-base: #16634d;");
        expect(css).toContain("@media (prefers-color-scheme: dark)");
        expect(css).toContain(":root[data-theme-mode=\"dark\"]");
        expect(css).toContain("--primary-base: #000000;");
    });

    test("only emits the selected theme", () => {
        const settings = defaultThemeSettings();
        settings.themes.push({
            id: "alternate",
            name: "Alternate",
            values: { light: { "primary-base": "#123456" }, dark: {} },
        });
        settings.activeThemeId = "alternate";

        const css = generateThemeCss(settings);

        expect(css).toContain("--primary-base: #123456;");
        expect(css).not.toContain("--primary-base: #16634d;");
    });

    test("rejects CSS values that can escape a declaration", () => {
        const settings = defaultThemeSettings();
        settings.themes[0]!.values.light["primary-base"] = "red; } body { display:none";

        expect(() => validateThemeSettings(settings)).toThrow(ContentValidationError);
    });

    test("rejects values for unknown tokens", () => {
        const settings = defaultThemeSettings();
        settings.themes[0]!.values.light.unknown = "red";

        expect(() => validateThemeSettings(settings)).toThrow("unknown token");
    });

    test("migrates existing CSS variables without changing their values", () => {
        const settings = themeSettingsFromCss(":root { --primary-base: rgb(206, 220, 80); --custom-gap: 12px; }");
        const theme = settings.themes[0]!;

        expect(theme.values.light["primary-base"]).toBe("rgb(206, 220, 80)");
        expect(theme.values.light["custom-gap"]).toBe("12px");
        expect(settings.sources.find((source) => source.id === "other")?.categories[0]?.tokens[0]?.variable).toBe("custom-gap");
        expect(settings.sources.some((source) => source.id === "existing-css")).toBeFalse();
    });

    test("moves tokens from the former import bucket into semantic categories", () => {
        const settings = defaultThemeSettings();
        settings.sources.push({
            id: "existing-css",
            label: "Existing CSS",
            supportsModes: false,
            categories: [{
                id: "variables",
                label: "Variables",
                description: "Legacy",
                tokens: [{ id: "info-muted", variable: "info-muted", label: "Info muted", description: "", type: "color" }],
            }],
        });

        const organized = organizeThemeSettings(settings);

        expect(organized.sources.some((source) => source.id === "existing-css")).toBeFalse();
        expect(organized.sources.find((source) => source.id === "colors")
            ?.categories.find((category) => category.id === "feedback")
            ?.tokens.some((token) => token.id === "info-muted")).toBeTrue();
    });

    test("repairs the former text-body type when its persisted value is a color", () => {
        const settings = defaultThemeSettings();
        const body = settings.sources.find((source) => source.id === "typography")!
            .categories.find((category) => category.id === "text-scale")!.tokens[0]!;
        body.id = "text-body";
        body.variable = "text-body";
        body.label = "Body size";
        settings.themes[0]!.values.light["text-body"] = "#3a2a1c";

        const organized = organizeThemeSettings(settings);

        expect(organized.sources.find((source) => source.id === "colors")
            ?.categories.find((category) => category.id === "text")
            ?.tokens.find((token) => token.id === "text-body"))
            .toMatchObject({ label: "Body text", type: "color" });
    });
});

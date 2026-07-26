import {
    ContentValidationError,
    defaultThemeSettings,
    generateThemeCss,
    validateThemeSettings,
} from "@bernouy/cms-content";

describe("structured themes", () => {
    test("emits the active theme as CSS custom properties", () => {
        const settings = defaultThemeSettings();
        settings.themes[0]!.values.dark["primary-base"] = "#000000";

        const css = generateThemeCss(settings);

        expect(css).toContain("--primary-base: #16634d;");
        expect(css).toContain("@media (prefers-color-scheme: dark)");
        expect(css).toContain(':root[data-theme-mode="dark"]');
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

    test("accepts specialized token types and rejects unknown metadata", () => {
        const settings = defaultThemeSettings();
        settings.sources.push({
            id: "specialized",
            label: "Specialized",
            supportsModes: true,
            categories: [
                {
                    id: "effects",
                    label: "Effects",
                    description: "Site-specific presentation values",
                    tokens: [
                        {
                            id: "specialized-length",
                            variable: "specialized-length",
                            label: "Content width",
                            description: "Maximum content width",
                            type: "length",
                        },
                        {
                            id: "specialized-number",
                            variable: "specialized-number",
                            label: "Surface opacity",
                            description: "Surface transparency",
                            type: "number",
                        },
                        {
                            id: "specialized-shadow",
                            variable: "specialized-shadow",
                            label: "Surface shadow",
                            description: "Surface elevation",
                            type: "shadow",
                        },
                    ],
                },
            ],
        });

        expect(validateThemeSettings(settings)).toEqual(settings);

        const token = settings.sources.at(-1)!.categories[0]!.tokens[0]!;
        (token as { type: string }).type = "gradient";
        expect(() => validateThemeSettings(settings)).toThrow("invalid token metadata");
    });

    test("treats ordinary catalogs as independent sources", () => {
        const settings = defaultThemeSettings();

        expect(settings.sources).toHaveLength(4);
        expect(settings.sources.every((source) => source.owner === undefined)).toBeTrue();
        expect(settings.sources.some((source) => source.id === "site-tokens")).toBeFalse();
    });

    test("rejects theme links between separately owned integrations", () => {
        const settings = defaultThemeSettings();
        settings.sources.push(
            integrationSource("gallery", "Gallery accent"),
            integrationSource("commerce", "Commerce accent"),
        );
        settings.themes[0]!.values.light["integration-gallery-accent"] =
            "var(--integration-commerce-accent, var(--primary-base))";

        expect(() => validateThemeSettings(settings)).toThrow("integration token cannot reference another integration");
    });
});

function integrationSource(integrationId: string, label: string) {
    const id = `integration-${integrationId}-accent`;
    return {
        id: `integration-${integrationId}`,
        label: integrationId,
        supportsModes: true,
        owner: { kind: "integration" as const, integrationId },
        categories: [
            {
                id: "general",
                label: "General",
                description: `${integrationId} tokens`,
                tokens: [
                    {
                        id,
                        variable: id,
                        label,
                        description: "Accent color",
                        type: "color" as const,
                        defaults: { light: "#336699" },
                    },
                ],
            },
        ],
    };
}

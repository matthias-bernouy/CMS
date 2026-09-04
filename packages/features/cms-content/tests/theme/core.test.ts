import {
    ContentValidationError,
    defaultThemeSettings,
    generateThemeCss,
    validateThemeSettings,
} from "@bernouy/cms-content";

describe("structured themes", () => {
    test("emits the active theme as CSS custom properties", () => {
        const settings = defaultThemeSettings();
        addCustomToken(settings, "brand-accent", "color");
        settings.themes[0]!.values.light["brand-accent"] = "#16634d";
        settings.themes[0]!.values.dark["brand-accent"] = "#000000";

        const css = generateThemeCss(settings);

        expect(css).toContain("--brand-accent: #16634d;");
        expect(css).toContain("@media (prefers-color-scheme: dark)");
        expect(css).toContain(':root[data-theme-mode="dark"]');
        expect(css).toContain("--brand-accent: #000000;");
    });

    test("only emits the selected theme", () => {
        const settings = defaultThemeSettings();
        addCustomToken(settings, "brand-accent", "color");
        settings.themes[0]!.values.light["brand-accent"] = "#16634d";
        settings.themes.push({
            id: "alternate",
            name: "Alternate",
            values: { light: { "brand-accent": "#123456" }, dark: {} },
        });
        settings.activeThemeId = "alternate";

        const css = generateThemeCss(settings);

        expect(css).toContain("--brand-accent: #123456;");
        expect(css).not.toContain("--brand-accent: #16634d;");
    });

    test("rejects CSS values that can escape a declaration", () => {
        const settings = defaultThemeSettings();
        addCustomToken(settings, "brand-accent", "color");
        settings.themes[0]!.values.light["brand-accent"] = "red; } body { display:none";

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

    test("starts with one empty editable catalogue for user variables", () => {
        const settings = defaultThemeSettings();

        expect(settings.sources).toEqual([
            {
                id: "custom",
                label: "Site variables",
                supportsModes: true,
                categories: [
                    {
                        id: "variables",
                        label: "Variables",
                        description: "Variables created by this site and reusable by installed integrations.",
                        tokens: [],
                    },
                ],
            },
        ]);
        expect(settings.themes[0]!.values).toEqual({ light: {}, dark: {} });
    });

    test("rejects theme links between separately owned integrations", () => {
        const settings = defaultThemeSettings();
        settings.sources.push(
            integrationSource("gallery", "Gallery accent"),
            integrationSource("commerce", "Commerce accent"),
        );
        settings.themes[0]!.values.light["gallery-accent"] = "var(--commerce-accent, var(--primary-base))";

        expect(() => validateThemeSettings(settings)).toThrow("integration token cannot reference another integration");
    });

    test("accepts theme links to explicitly declared integration dependencies", () => {
        const settings = defaultThemeSettings();
        const gallery = integrationSource("gallery", "Gallery accent");
        gallery.owner.dependencies = ["commerce"];
        settings.sources.push(gallery, integrationSource("commerce", "Commerce accent"));
        settings.themes[0]!.values.light["gallery-accent"] = "var(--commerce-accent, var(--primary-base))";

        expect(validateThemeSettings(settings)).toEqual(settings);
    });
});

function addCustomToken(settings: ReturnType<typeof defaultThemeSettings>, id: string, type: "color"): void {
    settings.sources[0]!.categories[0]!.tokens.push({
        id,
        variable: id,
        label: "Brand accent",
        description: "Custom brand accent",
        type,
    });
}

function integrationSource(integrationId: string, label: string) {
    const id = `${integrationId}-accent`;
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

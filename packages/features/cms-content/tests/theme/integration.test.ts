import {
    composeThemeSettings,
    createIntegrationThemeSource,
    defaultThemeSettings,
    generateThemeCss,
    integrationThemeTokenId,
    reconcileIntegrationTheme,
    removeIntegrationTheme,
    validateThemeSettings,
    type IntegrationThemeContribution,
} from "@bernouy/cms-content";

describe("integration theme contributions", () => {
    test("derives an owned namespace and emits calculated and font-family defaults", () => {
        const source = createIntegrationThemeSource(photoTheme());
        const settings = composeThemeSettings(defaultThemeSettings(), [photoTheme()]);
        const css = generateThemeCss(settings);

        expect(source).toMatchObject({
            id: "integration-photo-albums",
            owner: { kind: "integration", integrationId: "photo-albums" },
            supportsModes: true,
        });
        expect(source.categories[0]?.tokens).toEqual([
            expect.objectContaining({
                id: "integration-photo-albums-accent",
                variable: "integration-photo-albums-accent",
                defaults: { light: "var(--primary-base)", dark: "var(--secondary-base)" },
            }),
            expect.objectContaining({
                id: "integration-photo-albums-title-font",
                type: "font-family",
            }),
        ]);
        expect(css).toContain("--integration-photo-albums-accent: var(--primary-base);");
        expect(css).toContain('--integration-photo-albums-title-font: "Fraunces", Georgia, serif;');
        expect(css).toContain("--integration-photo-albums-accent: var(--secondary-base);");
    });

    test("keeps site overrides while provider defaults evolve", () => {
        const initial = composeThemeSettings(defaultThemeSettings(), [photoTheme()]);
        const tokenId = integrationThemeTokenId("photo-albums", "accent");
        initial.themes[0]!.values.light[tokenId] = "#f0a000";
        const changed = photoTheme();
        changed.categories[0]!.tokens[0]!.defaults.light = "var(--danger-base)";

        const rerun = composeThemeSettings(initial, [changed]);
        const token = rerun.sources.at(-1)!.categories[0]!.tokens[0]!;

        expect(rerun.themes[0]!.values.light[tokenId]).toBe("#f0a000");
        expect(token.defaults?.light).toBe("var(--danger-base)");
        expect(generateThemeCss(rerun)).toContain(`${token.variable}: #f0a000;`);
    });

    test("replaces the complete contributed catalog and removes only retired overrides", () => {
        const persisted = composeThemeSettings(defaultThemeSettings(), [photoTheme(), commerceTheme()]);
        const photoAccent = integrationThemeTokenId("photo-albums", "accent");
        const commerceAccent = integrationThemeTokenId("commerce", "accent");
        persisted.themes[0]!.values.light[photoAccent] = "#123456";
        persisted.themes[0]!.values.light[commerceAccent] = "#abcdef";
        persisted.themes[0]!.values.light["integration-orphan-accent"] = "#000000";

        const composed = composeThemeSettings(persisted, [photoTheme()]);

        expect(composed.sources.some((source) => source.id === "integration-commerce")).toBeFalse();
        expect(composed.themes[0]!.values.light[photoAccent]).toBe("#123456");
        expect(composed.themes[0]!.values.light[commerceAccent]).toBeUndefined();
        expect(composed.themes[0]!.values.light["integration-orphan-accent"]).toBeUndefined();
        expect(persisted.sources.some((source) => source.id === "integration-commerce")).toBeTrue();
        expect(persisted.themes[0]!.values.light[commerceAccent]).toBe("#abcdef");
    });

    test("can reconcile or remove one owner without touching another", () => {
        const base = composeThemeSettings(defaultThemeSettings(), [photoTheme(), commerceTheme()]);
        const reconciled = reconcileIntegrationTheme(base, photoTheme("Photo galleries"));
        const removed = removeIntegrationTheme(reconciled, "photo-albums");

        expect(reconciled.sources.find((source) => source.id === "integration-photo-albums")?.label).toBe(
            "Photo galleries",
        );
        expect(reconciled.sources.some((source) => source.id === "integration-commerce")).toBeTrue();
        expect(removed.sources.some((source) => source.id === "integration-photo-albums")).toBeFalse();
        expect(removed.sources.some((source) => source.id === "integration-commerce")).toBeTrue();
    });

    test("replaces a legacy reserved source even when its owner metadata is missing", () => {
        const base = defaultThemeSettings();
        const legacy = createIntegrationThemeSource(photoTheme());
        delete legacy.owner;
        base.sources.push(legacy);
        const tokenId = integrationThemeTokenId("photo-albums", "accent");
        base.themes[0]!.values.light[tokenId] = "#123456";

        const composed = composeThemeSettings(base, [photoTheme()]);

        expect(composed.sources.filter((source) => source.id === "integration-photo-albums")).toHaveLength(1);
        expect(composed.sources.at(-1)?.owner).toEqual({ kind: "integration", integrationId: "photo-albums" });
        expect(composed.themes[0]!.values.light[tokenId]).toBe("#123456");
    });

    test("rejects duplicate owners, foreign names and malformed var references", () => {
        expect(() => composeThemeSettings(defaultThemeSettings(), [photoTheme(), photoTheme()])).toThrow(
            "duplicate integration theme owner",
        );

        const forged = defaultThemeSettings();
        const source = createIntegrationThemeSource(photoTheme());
        source.categories[0]!.tokens[0]!.variable = "primary-base";
        forged.sources.push(source);
        expect(() => validateThemeSettings(forged)).toThrow("token name is not derived");

        delete source.owner;
        expect(() => validateThemeSettings({ ...defaultThemeSettings(), sources: [source] })).toThrow(
            "reserved integration source id",
        );

        const malformed = photoTheme();
        malformed.categories[0]!.tokens[0]!.defaults.light = "var(primary-base)";
        expect(() => createIntegrationThemeSource(malformed)).toThrow("invalid CSS variable reference");
    });
});

function photoTheme(label = "Photo Albums"): IntegrationThemeContribution {
    return {
        integrationId: "photo-albums",
        label,
        categories: [
            {
                id: "gallery",
                label: "Gallery",
                tokens: [
                    {
                        id: "accent",
                        label: "Accent",
                        type: "color",
                        defaults: { light: "var(--primary-base)", dark: "var(--secondary-base)" },
                    },
                    {
                        id: "title-font",
                        label: "Title font",
                        type: "font-family",
                        defaults: { light: '"Fraunces", Georgia, serif' },
                    },
                ],
            },
        ],
    };
}

function commerceTheme(): IntegrationThemeContribution {
    return {
        integrationId: "commerce",
        label: "Commerce",
        categories: [
            {
                id: "catalog",
                label: "Catalog",
                tokens: [{ id: "accent", label: "Accent", type: "color", defaults: { light: "#16634d" } }],
            },
        ],
    };
}

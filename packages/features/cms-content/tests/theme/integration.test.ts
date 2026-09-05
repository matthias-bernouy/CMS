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
        const source = createIntegrationThemeSource(brandTheme());
        const settings = composeThemeSettings(defaultThemeSettings(), [brandTheme()]);
        const css = generateThemeCss(settings);

        expect(source).toMatchObject({
            id: "integration-brand-kit",
            owner: { kind: "integration", integrationId: "brand-kit" },
            supportsModes: true,
        });
        expect(source.categories[0]?.tokens).toEqual([
            expect.objectContaining({
                id: "brand-kit-accent",
                variable: "brand-kit-accent",
                defaults: { light: "var(--primary-base)", dark: "var(--secondary-base)" },
            }),
            expect.objectContaining({
                id: "brand-kit-title-font",
                type: "font-family",
            }),
        ]);
        expect(css).toContain("--brand-kit-accent: var(--primary-base);");
        expect(css).toContain('--brand-kit-title-font: "Fraunces", Georgia, serif;');
        expect(css).toContain("--brand-kit-accent: var(--secondary-base);");
    });

    test("keeps configured overrides while provider defaults evolve", () => {
        const initial = composeThemeSettings(defaultThemeSettings(), [brandTheme()]);
        const tokenId = integrationThemeTokenId("brand-kit", "accent");
        initial.themes[0]!.values.light[tokenId] = "#f0a000";
        const changed = brandTheme();
        changed.categories[0]!.tokens[0]!.defaults.light = "var(--danger-base)";

        const rerun = composeThemeSettings(initial, [changed]);
        const token = rerun.sources.at(-1)!.categories[0]!.tokens[0]!;

        expect(rerun.themes[0]!.values.light[tokenId]).toBe("#f0a000");
        expect(token.defaults?.light).toBe("var(--danger-base)");
        expect(generateThemeCss(rerun)).toContain(`${token.variable}: #f0a000;`);
    });

    test("replaces the complete contributed catalog and removes only retired overrides", () => {
        const persisted = composeThemeSettings(defaultThemeSettings(), [brandTheme(), commerceTheme()]);
        const brandAccent = integrationThemeTokenId("brand-kit", "accent");
        const commerceAccent = integrationThemeTokenId("commerce", "accent");
        persisted.themes[0]!.values.light[brandAccent] = "#123456";
        persisted.themes[0]!.values.light[commerceAccent] = "#abcdef";
        persisted.themes[0]!.values.light["integration-orphan-accent"] = "#000000";

        const composed = composeThemeSettings(persisted, [brandTheme()]);

        expect(composed.sources.some((source) => source.id === "integration-commerce")).toBeFalse();
        expect(composed.themes[0]!.values.light[brandAccent]).toBe("#123456");
        expect(composed.themes[0]!.values.light[commerceAccent]).toBeUndefined();
        expect(composed.themes[0]!.values.light["integration-orphan-accent"]).toBeUndefined();
        expect(persisted.sources.some((source) => source.id === "integration-commerce")).toBeTrue();
        expect(persisted.themes[0]!.values.light[commerceAccent]).toBe("#abcdef");
    });

    test("can reconcile or remove one owner without touching another", () => {
        const base = composeThemeSettings(defaultThemeSettings(), [brandTheme(), commerceTheme()]);
        const reconciled = reconcileIntegrationTheme(base, brandTheme("Brand system"));
        const removed = removeIntegrationTheme(reconciled, "brand-kit");

        expect(reconciled.sources.find((source) => source.id === "integration-brand-kit")?.label).toBe("Brand system");
        expect(reconciled.sources.some((source) => source.id === "integration-commerce")).toBeTrue();
        expect(removed.sources.some((source) => source.id === "integration-brand-kit")).toBeFalse();
        expect(removed.sources.some((source) => source.id === "integration-commerce")).toBeTrue();
    });

    test("replaces a legacy reserved source even when its owner metadata is missing", () => {
        const base = defaultThemeSettings();
        const legacy = createIntegrationThemeSource(brandTheme());
        delete legacy.owner;
        base.sources.push(legacy);
        const tokenId = integrationThemeTokenId("brand-kit", "accent");
        base.themes[0]!.values.light[tokenId] = "#123456";

        const composed = composeThemeSettings(base, [brandTheme()]);

        expect(composed.sources.filter((source) => source.id === "integration-brand-kit")).toHaveLength(1);
        expect(composed.sources.at(-1)?.owner).toEqual({ kind: "integration", integrationId: "brand-kit" });
        expect(composed.themes[0]!.values.light[tokenId]).toBe("#123456");
    });

    test("migrates configured values from the former integration-prefixed token names", () => {
        const base = defaultThemeSettings();
        const legacy = createIntegrationThemeSource(brandTheme());
        const token = legacy.categories[0]!.tokens[0]!;
        token.id = "integration-brand-kit-accent";
        token.variable = token.id;
        base.sources.push(legacy);
        base.themes[0]!.values.light[token.id] = "#123456";

        const composed = composeThemeSettings(base, [brandTheme()]);

        expect(composed.themes[0]!.values.light["brand-kit-accent"]).toBe("#123456");
        expect(composed.themes[0]!.values.light["integration-brand-kit-accent"]).toBeUndefined();
    });

    test("rejects duplicate owners, foreign names and malformed var references", () => {
        expect(() => composeThemeSettings(defaultThemeSettings(), [brandTheme(), brandTheme()])).toThrow(
            "duplicate integration theme owner",
        );

        const forged = defaultThemeSettings();
        const source = createIntegrationThemeSource(brandTheme());
        source.categories[0]!.tokens[0]!.variable = "primary-base";
        forged.sources.push(source);
        expect(() => validateThemeSettings(forged)).toThrow("token name is not derived");

        delete source.owner;
        expect(() => validateThemeSettings({ ...defaultThemeSettings(), sources: [source] })).toThrow(
            "reserved integration source id",
        );

        const malformed = brandTheme();
        malformed.categories[0]!.tokens[0]!.defaults.light = "var(primary-base)";
        expect(() => createIntegrationThemeSource(malformed)).toThrow("invalid CSS variable reference");
    });

    test("carries declared dependencies into owned theme sources", () => {
        const dependent = brandTheme();
        dependent.dependencies = ["commerce"];
        dependent.categories[0]!.tokens[0]!.defaults.light = "var(--commerce-accent)";

        const settings = composeThemeSettings(defaultThemeSettings(), [dependent, commerceTheme()]);

        expect(settings.sources.find((source) => source.id === "integration-brand-kit")?.owner).toEqual({
            kind: "integration",
            integrationId: "brand-kit",
            dependencies: ["commerce"],
        });
        expect(validateThemeSettings(settings)).toEqual(settings);
    });
});

function brandTheme(label = "Brand Kit"): IntegrationThemeContribution {
    return {
        integrationId: "brand-kit",
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

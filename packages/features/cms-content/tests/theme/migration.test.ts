import {
    defaultThemeSettings,
    organizeThemeSettings,
    themeSettingsFromCss,
    type ThemeSource,
} from "@bernouy/cms-content";

describe("theme migrations", () => {
    test("imports existing CSS variables into the custom catalogue and infers alias types", () => {
        const settings = themeSettingsFromCss(
            ":root { --primary-base: rgb(206, 220, 80); --space-md: 1rem; --custom-gap: var(--space-md); }",
        );
        const theme = settings.themes[0]!;
        const tokens = customTokens(settings);

        expect(theme.values.light["primary-base"]).toBe("rgb(206, 220, 80)");
        expect(theme.values.light["custom-gap"]).toBe("var(--space-md)");
        expect(tokens.find((token) => token.variable === "primary-base")?.type).toBe("color");
        expect(tokens.find((token) => token.variable === "space-md")?.type).toBe("length");
        expect(tokens.find((token) => token.variable === "custom-gap")?.type).toBe("length");
        expect(settings.sources.map((source) => source.id)).toEqual(["custom"]);
    });

    test("repairs known legacy token types while moving them into custom variables", () => {
        const settings = defaultThemeSettings();
        settings.sources.push(
            legacySource("spacing", [
                token("font-size-body", "value"),
                token("space-md", "value"),
                token("radius-card", "value"),
                token("shadow-soft", "value"),
                token("custom-columns", "number"),
            ]),
        );

        const organized = organizeThemeSettings(settings);
        const types = new Map(customTokens(organized).map((entry) => [entry.id, entry.type]));

        expect(types.get("font-size-body")).toBe("length");
        expect(types.get("space-md")).toBe("length");
        expect(types.get("radius-card")).toBe("length");
        expect(types.get("shadow-soft")).toBe("shadow");
        expect(types.get("custom-columns")).toBe("number");
        expect(organized.sources.some((source) => source.id === "spacing")).toBeFalse();
    });

    test("keeps categories authored in the custom catalogue", () => {
        const settings = defaultThemeSettings();
        settings.sources[0]!.categories.push({
            id: "editorial",
            label: "Editorial palette",
            description: "Renamed by the site author",
            tokens: [token("article-accent", "color")],
        });

        const organized = organizeThemeSettings(settings);
        const editorial = organized.sources[0]!.categories.find((category) => category.id === "editorial");

        expect(editorial).toMatchObject({
            label: "Editorial palette",
            description: "Renamed by the site author",
            tokens: [{ id: "article-accent", type: "color" }],
        });
    });

    test("moves tokens from the former import bucket into custom variables", () => {
        const settings = defaultThemeSettings();
        settings.sources.push(legacySource("existing-css", [token("info-muted", "color")]));

        const organized = organizeThemeSettings(settings);

        expect(organized.sources.some((source) => source.id === "existing-css")).toBeFalse();
        expect(customTokens(organized).some((entry) => entry.id === "info-muted")).toBeTrue();
    });

    test("removes every former global catalogue without losing token values", () => {
        const settings = defaultThemeSettings();
        for (const id of ["colors", "typography", "spacing", "shape", "imported-css", "site-tokens"]) {
            settings.sources.push(legacySource(id, [token(`${id}-value`, "value")]));
            settings.themes[0]!.values.light[`${id}-value`] = id;
        }

        const organized = organizeThemeSettings(settings);

        expect(organized.sources.map((source) => source.id)).toEqual(["custom"]);
        expect(customTokens(organized)).toHaveLength(6);
        expect(organized.themes[0]!.values.light).toHaveProperty("colors-value", "colors");
        expect(organized.themes[0]!.values.light).toHaveProperty("site-tokens-value", "site-tokens");
    });
});

function customTokens(settings: ReturnType<typeof defaultThemeSettings>) {
    return settings.sources.find((source) => source.id === "custom")!.categories.flatMap((category) => category.tokens);
}

function legacySource(id: string, tokens: ThemeSource["categories"][number]["tokens"]): ThemeSource {
    return {
        id,
        label: id,
        supportsModes: true,
        categories: [{ id: "general", label: "General", description: "Legacy variables", tokens }],
    };
}

function token(id: string, type: ThemeSource["categories"][number]["tokens"][number]["type"]) {
    return { id, variable: id, label: id, description: `${id} variable`, type };
}

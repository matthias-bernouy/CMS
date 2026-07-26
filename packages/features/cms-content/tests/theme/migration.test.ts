import { defaultThemeSettings, organizeThemeSettings, themeSettingsFromCss } from "@bernouy/cms-content";

describe("theme migrations", () => {
    test("migrates existing CSS variables and infers direct alias types", () => {
        const settings = themeSettingsFromCss(
            ":root { --primary-base: rgb(206, 220, 80); --custom-gap: var(--space-md); }",
        );
        const theme = settings.themes[0]!;
        const customGap = settings.sources
            .find((source) => source.id === "imported-css")
            ?.categories.flatMap((category) => category.tokens)
            .find((token) => token.variable === "custom-gap");

        expect(theme.values.light["primary-base"]).toBe("rgb(206, 220, 80)");
        expect(theme.values.light["custom-gap"]).toBe("var(--space-md)");
        expect(customGap?.type).toBe("length");
        expect(settings.sources.find((source) => source.id === "site-tokens")?.owner).toEqual({ kind: "site" });
        expect(settings.sources.some((source) => source.id === "existing-css")).toBeFalse();
    });

    test("classifies only built-in controls by their editing semantics", () => {
        const settings = defaultThemeSettings();
        for (const token of settings.sources.flatMap((source) =>
            source.categories.flatMap((category) => category.tokens),
        )) {
            if (["font-size-body", "space-md", "radius-card", "shadow-soft"].includes(token.id)) {
                token.type = "value";
            }
        }
        settings.sources
            .find((source) => source.id === "spacing")!
            .categories[0]!.tokens.push({
                id: "custom-30",
                variable: "custom-30",
                label: "Grid columns",
                description: "Custom design token",
                type: "number",
            });

        const organized = organizeThemeSettings(settings);
        const tokens = new Map(
            organized.sources.flatMap((source) =>
                source.categories.flatMap((category) => category.tokens.map((token) => [token.id, token.type])),
            ),
        );

        expect(tokens.get("font-size-body")).toBe("length");
        expect(tokens.get("space-md")).toBe("length");
        expect(tokens.get("radius-card")).toBe("length");
        expect(tokens.get("shadow-soft")).toBe("shadow");
        expect(tokens.get("custom-30")).toBe("number");
        expect(
            organized.sources
                .find((source) => source.id === "site-tokens")
                ?.categories.flatMap((category) => category.tokens)
                .some((token) => token.id === "custom-30"),
        ).toBeTrue();
    });

    test("preserves legacy custom categories as editable site tokens", () => {
        const settings = defaultThemeSettings();
        settings.sources
            .find((source) => source.id === "colors")!
            .categories.push({
                id: "colors-category-5",
                label: "Editorial palette",
                description: "Renamed by the site author",
                tokens: [
                    {
                        id: "custom-31",
                        variable: "custom-31",
                        label: "Article accent",
                        description: "Edited metadata",
                        type: "color",
                    },
                ],
            });

        const organized = organizeThemeSettings(settings);
        const migrated = organized.sources
            .find((source) => source.id === "site-tokens")
            ?.categories.find((category) => category.id === "colors-category-5");

        expect(migrated).toMatchObject({
            label: "Editorial palette",
            description: "Renamed by the site author",
            tokens: [{ id: "custom-31", label: "Article accent", type: "color" }],
        });
        expect(
            organized.sources
                .find((source) => source.id === "colors")
                ?.categories.some((category) => category.id === "colors-category-5"),
        ).toBeFalse();
    });

    test("moves tokens from the former import bucket into semantic categories", () => {
        const settings = defaultThemeSettings();
        settings.sources.push({
            id: "existing-css",
            label: "Existing CSS",
            supportsModes: false,
            categories: [
                {
                    id: "variables",
                    label: "Variables",
                    description: "Legacy",
                    tokens: [
                        {
                            id: "info-muted",
                            variable: "info-muted",
                            label: "Info muted",
                            description: "",
                            type: "color",
                        },
                    ],
                },
            ],
        });

        const organized = organizeThemeSettings(settings);

        expect(organized.sources.some((source) => source.id === "existing-css")).toBeFalse();
        expect(
            organized.sources
                .find((source) => source.id === "colors")
                ?.categories.find((category) => category.id === "feedback")
                ?.tokens.some((token) => token.id === "info-muted"),
        ).toBeTrue();
    });

    test("repairs the former text-body type when its persisted value is a color", () => {
        const settings = defaultThemeSettings();
        const body = settings.sources
            .find((source) => source.id === "typography")!
            .categories.find((category) => category.id === "text-scale")!.tokens[0]!;
        body.id = "text-body";
        body.variable = "text-body";
        body.label = "Body size";
        settings.themes[0]!.values.light["text-body"] = "#3a2a1c";

        const organized = organizeThemeSettings(settings);

        expect(
            organized.sources
                .find((source) => source.id === "colors")
                ?.categories.find((category) => category.id === "text")
                ?.tokens.find((token) => token.id === "text-body"),
        ).toMatchObject({ label: "Body text", type: "color" });
    });
});

import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("integration theme definitions", () => {
    test("parses local tokens, mode defaults, aliases, and font families", () => {
        const definition = parseIntegrationDefinition(
            themedDefinition({
                categories: [
                    {
                        id: "gallery",
                        label: "Gallery",
                        description: "Photo presentation",
                        tokens: [
                            {
                                id: "accent",
                                label: "Accent",
                                type: "color",
                                defaults: {
                                    light: " var(--primary-base) ",
                                    dark: "var(--primary-contrasted)",
                                },
                            },
                            {
                                id: "title-font",
                                label: "Title font",
                                type: "font-family",
                                defaults: { light: '"Instrument Serif", Georgia, serif' },
                            },
                            {
                                id: "item-gap",
                                label: "Item gap",
                                type: "value",
                                defaults: { light: "clamp(1rem, 3vw, 2rem)" },
                            },
                        ],
                    },
                ],
            }),
        );

        expect(definition.theme).toEqual({
            categories: [
                {
                    id: "gallery",
                    label: "Gallery",
                    description: "Photo presentation",
                    tokens: [
                        {
                            id: "accent",
                            label: "Accent",
                            type: "color",
                            defaults: {
                                light: "var(--primary-base)",
                                dark: "var(--primary-contrasted)",
                            },
                        },
                        {
                            id: "title-font",
                            label: "Title font",
                            type: "font-family",
                            defaults: { light: '"Instrument Serif", Georgia, serif' },
                        },
                        {
                            id: "item-gap",
                            label: "Item gap",
                            type: "value",
                            defaults: { light: "clamp(1rem, 3vw, 2rem)" },
                        },
                    ],
                },
            ],
        });
    });

    test("rejects integration-provided CSS variable names", () => {
        expect(() =>
            parseIntegrationDefinition(
                themedDefinition(
                    oneToken({
                        id: "accent",
                        label: "Accent",
                        type: "color",
                        variable: "commerce-accent",
                        defaults: { light: "red" },
                    }),
                ),
            ),
        ).toThrow("must not be declared; the CMS generates it");
    });

    test.each([
        ["category ids", oneToken(validToken(), { id: "Gallery" }), "lowercase kebab-case identifier"],
        ["token ids", oneToken({ ...validToken(), id: "accent.color" }), "lowercase kebab-case identifier"],
        [
            "duplicate categories",
            { categories: [oneCategory(), oneCategory()] },
            "duplicate theme category id: gallery",
        ],
        [
            "duplicate tokens across categories",
            {
                categories: [oneCategory(), oneCategory({ id: "detail", label: "Detail" })],
            },
            "duplicate theme token id: accent",
        ],
        [
            "unknown token types",
            oneToken({ ...validToken(), type: "gradient" }),
            "must be color, value, or font-family",
        ],
    ])("rejects invalid %s", (_case, theme, error) => {
        expect(() => parseIntegrationDefinition(themedDefinition(theme))).toThrow(error);
    });

    test.each([
        "red; color: transparent",
        "red } body { display: none",
        "var(--primary-base) !important",
        "/* hidden */ red",
        "rgb(1 2 3",
        '"unterminated font',
        "var(primary-base)",
    ])("rejects unsafe or malformed CSS defaults: %s", (light) => {
        expect(() =>
            parseIntegrationDefinition(themedDefinition(oneToken({ ...validToken(), defaults: { light } }))),
        ).toThrow(/safe CSS value|balanced CSS value|var\(--token-name\)/);
    });
});

function themedDefinition(theme: unknown): Record<string, unknown> {
    return { kind: "photo-albums", label: "Photo Albums", inputs: [], theme };
}

function oneToken(token: Record<string, unknown>, category: Record<string, unknown> = {}): Record<string, unknown> {
    return { categories: [oneCategory({ ...category, tokens: [token] })] };
}

function oneCategory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: "gallery", label: "Gallery", tokens: [validToken()], ...overrides };
}

function validToken(): Record<string, unknown> {
    return { id: "accent", label: "Accent", type: "color", defaults: { light: "var(--primary-base)" } };
}

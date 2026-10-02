import { describe, expect, test } from "bun:test";
import {
    DEFAULT_COLLECTION_LIMITS,
    collectionThemeSourceId,
    collectionThemeTokenId,
    isCollectionNamespace,
    parseCollectionRelease,
    parseCollectionReleaseJson,
    resolveCollectionTranslation,
} from "@bernouy/cms-repository/collections";
import { canonicalIJsonBytes } from "@bernouy/cms-repository/contracts/protocol";
import { collectionDocument } from "./fixtures";

describe("collection release parsing", () => {
    test("reserves one HTML and CSS safe namespace for every collection", () => {
        expect(isCollectionNamespace("atlas")).toBe(true);
        expect(isCollectionNamespace("atlas-widgets")).toBe(true);
        expect(collectionThemeSourceId("atlas-widgets")).toBe("collection-atlas-widgets");
        expect(collectionThemeTokenId("atlas-widgets", "accent")).toBe("atlas-widgets-accent");
        expect(() => collectionThemeTokenId("atlas-widgets", "accent--strong")).toThrow("Invalid local");

        for (const collectionId of [
            "atlas.widgets",
            "cms",
            "cms-tools",
            "p9r-library",
            "w13c-kit",
            "be5-components",
            "site",
            "site-private",
        ]) {
            expect(isCollectionNamespace(collectionId)).toBe(false);
            expect(() => parseCollectionRelease({ ...collectionDocument(), collectionId })).toThrow(/namespace/i);
        }
        expect(() =>
            parseCollectionReleaseJson(JSON.stringify({ ...collectionDocument(), collectionId: "cms-tools" })),
        ).toThrow(/namespace/i);
    });

    test("reports validation paths in the collection document", () => {
        try {
            parseCollectionRelease({ ...collectionDocument(), version: "v1.0.0" });
            throw new Error("Expected rejection");
        } catch (error) {
            expect(error).toMatchObject({ code: "invalid_collection", path: "$.version" });
        }
        try {
            parseCollectionRelease({
                ...collectionDocument(),
                configuration: {
                    schema: { type: "object", properties: { title: { type: "string", maxLength: -1 } }, required: [] },
                    defaults: {},
                },
            });
            throw new Error("Expected rejection");
        } catch (error) {
            expect(error).toMatchObject({
                code: "invalid_collection",
                path: "$.configuration.schema.properties.title.maxLength",
            });
        }
    });

    test("normalizes resource order and locale into independent immutable data", () => {
        const source = collectionDocument();
        source.locale = "en-us";
        const parsed = parseCollectionRelease(source);
        expect(parsed.locale).toBe("en-US");
        expect(parsed.blocs.map((bloc) => bloc.id)).toEqual(["atlas-page", "atlas-panel"]);
        expect(Object.isFrozen(source.blocs)).toBe(false);
        expect(Object.isFrozen(parsed.blocs)).toBe(true);
        (source.blocs as Record<string, unknown>[])[0]!.shadowdom = "Changed";
        expect(parsed.blocs.find((bloc) => bloc.kind === "component")!.shadowdom).toContain("<section>");
        expect(parseCollectionReleaseJson(JSON.stringify(parsed))).toEqual(parsed);
    });

    test("rejects unsupported fields and malformed identity or version metadata", () => {
        for (const patch of [
            { providerId: "provider" },
            { imports: [] },
            { views: null },
            { locale: "en_US" },
            { kind: "contract" },
            { protocol: "ulvia-provider/v1" },
            { assets: null },
            { blocs: null },
            ...["v1.0.0", "1.0", "01.0.0", "1.0.0-01", "^1.0.0"].map((version) => ({ version })),
        ]) {
            expect(() => parseCollectionRelease({ ...collectionDocument(), ...patch })).toThrow();
        }
    });

    test("uses the same byte and depth limits for object and JSON entry points", () => {
        const source = parseCollectionRelease(collectionDocument());
        const byteLength = canonicalIJsonBytes(source).byteLength;
        const limits = { ...DEFAULT_COLLECTION_LIMITS, maxDocumentBytes: byteLength };
        expect(parseCollectionRelease(source, limits)).toEqual(source);
        expect(parseCollectionReleaseJson(JSON.stringify(source), limits)).toEqual(source);
        for (const override of [{ maxDocumentBytes: byteLength - 1 }, { maxJsonDepth: 2 }]) {
            const constrained = { ...DEFAULT_COLLECTION_LIMITS, ...override };
            expect(() => parseCollectionRelease(source, constrained)).toThrow();
            expect(() => parseCollectionReleaseJson(JSON.stringify(source), constrained)).toThrow();
        }
    });

    test("rejects invalid I-JSON before traversing resources", () => {
        const source = collectionDocument();
        expect(() => parseCollectionRelease({ ...source, blocs: Array(1) })).toThrow();
        expect(() => parseCollectionReleaseJson('{"kind":"collection","kind":"collection"}')).toThrow();
        expect(() => parseCollectionReleaseJson(new Uint8Array([0xff]))).toThrow();
        let reads = 0;
        const accessor = Object.defineProperty({ ...source }, "blocs", {
            enumerable: true,
            get() {
                reads += 1;
                return [];
            },
        });
        expect(() => parseCollectionRelease(accessor)).toThrow();
        expect(reads).toBe(0);
    });

    test("bounds schema/defaults and preserves custom schema limits", () => {
        const configuration = {
            schema: {
                type: "object",
                properties: { label: { type: "string", maxLength: 10000 } },
                required: ["label"],
            },
            defaults: { label: "Welcome" },
        };
        const source = { ...collectionDocument(), configuration };
        expect(() => parseCollectionRelease(source)).toThrow();
        const limits = {
            ...DEFAULT_COLLECTION_LIMITS,
            schema: { ...DEFAULT_COLLECTION_LIMITS.schema, maxStringLength: 10000 },
        };
        expect(parseCollectionRelease(source, limits).configuration).toEqual(configuration);
        expect(parseCollectionReleaseJson(JSON.stringify(source), limits).configuration).toEqual(configuration);
        for (const patch of [
            { defaults: {} },
            { defaults: { label: 1 } },
            { defaults: { label: "OK", extra: true } },
            { schema: { ...configuration.schema, nullable: true } },
            {
                schema: {
                    type: "object",
                    properties: { file: { type: "binary", maxBytes: 8, mediaTypes: ["image/png"] } },
                    required: [],
                },
            },
        ]) {
            expect(() =>
                parseCollectionRelease({ ...source, configuration: { ...configuration, ...patch } }, limits),
            ).toThrow();
        }
    });

    test("keeps theme token IDs local after validating their global names", () => {
        const parsed = parseCollectionRelease({
            ...collectionDocument({
                "theme.category.colors.description": "Theme colors",
                "theme.category.colors.label": "Colors",
                "theme.label": "Atlas theme",
                "theme.token.accent.description": "Primary emphasis",
                "theme.token.accent.label": "Accent",
            }),
            theme: {
                label: "theme.label",
                categories: [
                    {
                        id: "colors",
                        label: "theme.category.colors.label",
                        description: "theme.category.colors.description",
                        tokens: [
                            {
                                id: "accent",
                                label: "theme.token.accent.label",
                                description: "theme.token.accent.description",
                                type: "color",
                                defaults: { light: "#123456" },
                            },
                        ],
                    },
                ],
            },
        });

        expect(parsed.theme?.label).toBe("theme.label");
        expect(parsed.theme?.categories[0]?.label).toBe("theme.category.colors.label");
        expect(resolveCollectionTranslation(parsed, parsed.theme!.label)).toBe("Atlas theme");
        expect(parsed.theme?.categories[0]?.tokens[0]?.id).toBe("accent");
        expect(collectionThemeTokenId(parsed.collectionId, parsed.theme!.categories[0]!.tokens[0]!.id)).toBe(
            "atlas-accent",
        );
    });

    test("validates theme token references, types and cycles", () => {
        const themed = (tokens: Record<string, unknown>[]) => ({
            ...collectionDocument({
                "theme.category.values.label": "Values",
                "theme.label": "Atlas theme",
                "theme.token.first.label": "First",
                "theme.token.second.label": "Second",
            }),
            theme: {
                label: "theme.label",
                categories: [{ id: "values", label: "theme.category.values.label", tokens }],
            },
        });
        const token = (id: string, type: string, light: string) => ({
            id,
            label: `theme.token.${id}.label`,
            type,
            defaults: { light },
        });

        expect(() => parseCollectionRelease(themed([token("first", "color", "var(--atlas-missing)")]))).toThrow(
            "unknown or unimported",
        );
        expect(() =>
            parseCollectionRelease(
                themed([token("first", "color", "var(--atlas-second)"), token("second", "length", "1rem")]),
            ),
        ).toThrow("cannot use length");
        expect(() =>
            parseCollectionRelease(
                themed([
                    token("first", "color", "var(--atlas-second)"),
                    token("second", "color", "var(--atlas-first)"),
                ]),
            ),
        ).toThrow("cyclic theme token");
    });

    test("declares selective exports and cross-collection imports", () => {
        const source = collectionDocument({
            "theme.category.colors.label": "Colors",
            "theme.label": "Atlas theme",
            "theme.token.accent.label": "Accent",
        });
        source.theme = {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.category.colors.label",
                    tokens: [
                        {
                            id: "accent",
                            label: "theme.token.accent.label",
                            type: "color",
                            defaults: { light: "#123456" },
                        },
                    ],
                },
            ],
        };
        source.exports = { blocs: ["atlas-panel"], themeTokens: ["accent"] };
        source.dependencies = [
            {
                collectionId: "ulvia-official",
                publisherId: "ulvia.official",
                versionRange: "^1.0.0",
                imports: { blocs: ["ulvia-official-button"], themeTokens: ["primary"] },
            },
        ];
        (source.blocs as Record<string, unknown>[])[1]!.uses = ["atlas-panel", "ulvia-official-button"];
        (source.blocs as Record<string, unknown>[])[1]!.lightdom =
            '<atlas-panel><slot name="main" slot="body"></slot><ulvia-official-button slot="body"></ulvia-official-button></atlas-panel>';

        const parsed = parseCollectionRelease(source);
        expect(parsed.exports).toEqual({ blocs: ["atlas-panel"], themeTokens: ["accent"] });
        expect(parsed.dependencies?.[0]).toEqual({
            collectionId: "ulvia-official",
            publisherId: "ulvia.official",
            versionRange: "^1.0.0",
            imports: { blocs: ["ulvia-official-button"], themeTokens: ["primary"] },
        });

        expect(() =>
            parseCollectionRelease({ ...source, exports: { blocs: ["atlas-missing"], themeTokens: [] } }),
        ).toThrow("unknown exported bloc");
        expect(() =>
            parseCollectionRelease({
                ...source,
                dependencies: (source.dependencies as Record<string, unknown>[]).map((dependency) => ({
                    ...dependency,
                    imports: { blocs: [], themeTokens: [] },
                })),
            }),
        ).toThrow("at least one");
    });

    test("validates reusable translation keys and locale fallback", () => {
        const source = collectionDocument({ "theme.label": "Atlas theme" });
        (source.translations as Record<string, Record<string, string>>).fr = {
            "collection.name": "Interface Atlas",
            "theme.label": "Thème Atlas",
        };
        const parsed = parseCollectionRelease({
            ...source,
            theme: { label: "theme.label", categories: [] },
        });
        expect(resolveCollectionTranslation(parsed, "theme.label", "fr-FR")).toBe("Thème Atlas");
        expect(resolveCollectionTranslation(parsed, "bloc.panel.label", "fr-FR")).toBe("Panel");

        expect(() =>
            parseCollectionRelease({
                ...collectionDocument(),
                locale: "fr",
                translations: { en: { "collection.name": "Atlas" } },
            }),
        ).toThrow(/collection locale/);
        expect(() =>
            parseCollectionRelease({
                ...collectionDocument(),
                translations: {
                    "en-us": { "collection.name": "Atlas" },
                    "en-US": { "collection.name": "Duplicate" },
                },
            }),
        ).toThrow(/duplicate canonical locales/);
        expect(() =>
            parseCollectionRelease({
                ...collectionDocument(),
                theme: { label: "theme.missing", categories: [] },
            }),
        ).toThrow(/missing default translation/);
    });
});

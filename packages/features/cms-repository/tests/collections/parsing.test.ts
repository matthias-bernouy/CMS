import { collectionFixture } from "./admission/examples/buildFixture";
import { describe, expect, test } from "bun:test";
import {
    DEFAULT_COLLECTION_LIMITS,
    collectionThemeSourceId,
    collectionThemeTokenId,
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    describeCollectionResources,
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
        expect(collectionThemeSourceId("atlas-widgets")).toBe("contribution-atlas-widgets");
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
            expect(() => parseCollectionRelease(collectionFixture({ ...collectionDocument(), collectionId }))).toThrow(
                /namespace/i,
            );
        }
        expect(() =>
            parseCollectionReleaseJson(JSON.stringify({ ...collectionDocument(), collectionId: "cms-tools" })),
        ).toThrow(/namespace/i);
    });

    test("reports validation paths in the collection document", () => {
        try {
            parseCollectionRelease(collectionFixture({ ...collectionDocument(), version: "v1.0.0" }));
            throw new Error("Expected rejection");
        } catch (error) {
            expect(error).toMatchObject({ code: "invalid_collection", path: "$.version" });
        }
        try {
            parseCollectionRelease(
                collectionFixture({
                    ...collectionDocument(),
                    configuration: {
                        schema: {
                            type: "object",
                            properties: { title: { type: "string", maxLength: -1 } },
                            required: [],
                        },
                        defaults: {},
                    },
                }),
            );
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
        const parsed = parseCollectionRelease(collectionFixture(source));
        expect(parsed.locale).toBe("en-US");
        expect(parsed.blocs.map((bloc) => bloc.id)).toEqual(["atlas-page", "atlas-panel"]);
        expect(Object.isFrozen(source.blocs)).toBe(false);
        expect(Object.isFrozen(parsed.blocs)).toBe(true);
        (source.blocs as Record<string, unknown>[])[0]!.markup = "Changed";
        expect(parsed.blocs.find((bloc) => bloc.kind === "component")!.markup).toContain("<section>");
        expect(parseCollectionReleaseJson(JSON.stringify(parsed))).toEqual(parsed);
    });

    test("rejects unsupported fields and malformed identity or version metadata", () => {
        for (const patch of [
            { providerId: "provider" },
            { imports: [] },
            { pages: null },
            { locale: "en_US" },
            { kind: "contract" },
            { protocol: "ulvia-provider/v1" },
            { assets: null },
            { blocs: null },
            { exports: "*" },
            ...["v1.0.0", "1.0", "01.0.0", "1.0.0-01", "^1.0.0"].map((version) => ({ version })),
        ]) {
            expect(() => parseCollectionRelease({ ...collectionDocument(), ...patch })).toThrow();
        }
    });

    test("uses the same byte and depth limits for object and JSON entry points", () => {
        const source = parseCollectionRelease(collectionFixture(collectionDocument()));
        const byteLength = canonicalIJsonBytes(source).byteLength;
        const limits = { ...DEFAULT_COLLECTION_LIMITS, maxDocumentBytes: byteLength };
        expect(parseCollectionRelease(collectionFixture(source), limits)).toEqual(source);
        expect(parseCollectionReleaseJson(JSON.stringify(source), limits)).toEqual(source);
        for (const override of [{ maxDocumentBytes: byteLength - 1 }, { maxJsonDepth: 2 }]) {
            const constrained = { ...DEFAULT_COLLECTION_LIMITS, ...override };
            expect(() => parseCollectionRelease(collectionFixture(source), constrained)).toThrow();
            expect(() => parseCollectionReleaseJson(JSON.stringify(source), constrained)).toThrow();
        }
    });

    test("uses independent resource ceilings instead of the Bloc limit for every list", () => {
        expect(DEFAULT_COLLECTION_LIMITS).toMatchObject({
            maxDocumentBytes: 8 * 1024 * 1024,
            maxBlocs: 512,
            maxAssets: 1_024,
            maxTexts: 4_096,
            maxStates: 512,
            maxDependencies: 128,
            maxThemeCategories: 64,
            maxThemeTokens: 4_096,
        });
        const tokens = ["accent", "surface", "border"].map((id) => ({
            id,
            label: "theme.token.label",
            type: "color",
            defaults: { light: "#000000" },
        }));
        const source = collectionDocument({
            "theme.label": "Theme",
            "theme.category.label": "Colors",
            "theme.token.label": "Color",
        });
        source.theme = {
            label: "theme.label",
            categories: [{ id: "colors", label: "theme.category.label", entries: tokens }],
        };
        source.exports = { blocs: [], themeTokens: tokens.map(({ id }) => id) };
        const release = parseCollectionRelease(collectionFixture(source), {
            ...DEFAULT_COLLECTION_LIMITS,
            maxBlocs: 2,
            maxThemeCategories: 1,
            maxThemeTokens: 3,
        });
        expect(release.exports?.themeTokens).toEqual(["accent", "border", "surface"]);
    });

    test("admits collection documents beyond the former two MiB transport ceiling", () => {
        const source = collectionDocument();
        (source.blocs as Record<string, unknown>[])[0]!.runtime = {
            browserAbi: "v1",
            viewJS: `void ${JSON.stringify("x".repeat(2 * 1024 * 1024))}`,
        };
        expect(parseCollectionRelease(collectionFixture(source)).blocs[1]).toHaveProperty("runtime");
        expect(parseCollectionReleaseJson(JSON.stringify(source)).blocs[1]).toHaveProperty("runtime");
    });

    test("requires and validates the browser ABI for compiled Bloc behavior", () => {
        const source = collectionDocument();
        const component = (source.blocs as Record<string, unknown>[])[0]!;

        component.runtime = { viewJS: "void 0" };
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow("must equal v1 when viewJS is present");

        component.runtime = { browserAbi: "v2", viewJS: "void 0" };
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow("must equal v1 when viewJS is present");

        component.runtime = { browserAbi: "v1" };
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow("is only allowed with viewJS");
    });

    test("admits only exact iframe browser capabilities", () => {
        const source = collectionDocument();
        const component = (source.blocs as Record<string, unknown>[])[0]!;
        component.markup =
            '<section><iframe src="https://maps.example.test" title="{{ label }}" sandbox="allow-same-origin allow-scripts"></iframe><slot name="body"></slot></section>';
        component.browser = {
            frames: {
                origins: ["https://maps.example.test"],
                sandbox: ["allow-same-origin", "allow-scripts"],
            },
        };
        expect(
            parseCollectionRelease(collectionFixture(source)).blocs.find(({ id }) => id === "atlas-panel")?.browser,
        ).toEqual(component.browser);

        delete component.browser;
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/must be declared/);
        component.browser = {
            frames: {
                origins: ["https://other.example.test"],
                sandbox: ["allow-same-origin", "allow-scripts"],
            },
        };
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/must exactly match/);
    });

    test("reports deterministic browser authority and treats every script as high authority", () => {
        const plain = parseCollectionRelease(collectionFixture(collectionDocument()));
        const source = collectionDocument();
        const component = (source.blocs as Record<string, unknown>[])[0]!;
        component.markup =
            '<section><iframe src="https://maps.example.test" title="{{ label }}" sandbox="allow-same-origin allow-scripts"></iframe><slot name="body"></slot></section>';
        component.browser = {
            frames: {
                origins: ["https://maps.example.test"],
                sandbox: ["allow-same-origin", "allow-scripts"],
            },
        };
        component.runtime = { browserAbi: "v1", viewJS: "void 0" };
        const risky = parseCollectionRelease(collectionFixture(source));
        const plainReport = collectionBrowserRisk(plain);
        const riskyReport = collectionBrowserRisk(risky);
        expect(plainReport.level).toBe("none");
        expect(riskyReport).toMatchObject({
            level: "high",
            javaScriptBlocs: ["atlas-panel"],
            externalFrameOrigins: ["https://maps.example.test"],
            scriptsWithSameOrigin: true,
        });
        expect(collectionBrowserRiskDigest(riskyReport)).toMatch(/^sha256:[a-f0-9]{64}$/);
        component.markup = '<section><slot name="body"></slot></section>';
        delete component.browser;
        const scriptOnly = collectionBrowserRisk(parseCollectionRelease(collectionFixture(source)));
        expect(scriptOnly).toMatchObject({ level: "high", javaScriptBlocs: ["atlas-panel"], frameBlocs: [] });
    });

    test("rechecks compiled Bloc behavior at collection admission", () => {
        const source = collectionDocument();
        const component = (source.blocs as Record<string, unknown>[])[0]!;

        for (const viewJS of [
            "customElements.define('unsafe-element', class extends HTMLElement {})",
            "document.body.attachShadow({ mode: 'open' })",
            "document.createElement('iframe')",
            "window.location.href = '/escaped'",
            "try {",
        ]) {
            component.runtime = { browserAbi: "v1", viewJS };
            expect(() => parseCollectionRelease(collectionFixture(source))).toThrow();
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
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow();
        const limits = {
            ...DEFAULT_COLLECTION_LIMITS,
            schema: { ...DEFAULT_COLLECTION_LIMITS.schema, maxStringLength: 10000 },
        };
        expect(parseCollectionRelease(collectionFixture(source), limits).configuration).toEqual({
            ...configuration,
        });
        expect(parseCollectionReleaseJson(JSON.stringify(source), limits).configuration).toEqual({
            ...configuration,
        });
        for (const patch of [
            { defaults: {} },
            { defaults: { label: 1 } },
            { defaults: { label: "OK", extra: true } },
            { schema: { ...configuration.schema, nullable: true } },
            {
                schema: {
                    type: "object",
                    properties: { file: { type: "binary", maxBytes: 8 } },
                    required: [],
                },
            },
        ]) {
            expect(() =>
                parseCollectionRelease(
                    collectionFixture({ ...source, configuration: { ...configuration, ...patch } }),
                    limits,
                ),
            ).toThrow();
        }
    });

    test("keeps theme token IDs local after validating their global names", () => {
        const parsed = parseCollectionRelease(
            collectionFixture({
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
                            entries: [
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
            }),
        );

        expect(parsed.theme?.label).toBe("theme.label");
        expect(parsed.theme?.categories[0]?.label).toBe("theme.category.colors.label");
        expect(resolveCollectionTranslation(parsed, parsed.theme!.label)).toBe("Atlas theme");
        expect(parsed.theme?.categories[0]?.entries[0]?.id).toBe("accent");
        expect(collectionThemeTokenId(parsed.collectionId, parsed.theme!.categories[0]!.entries[0]!.id)).toBe(
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
                categories: [{ id: "values", label: "theme.category.values.label", entries: tokens }],
            },
        });
        const token = (id: string, type: string, light: string) => ({
            id,
            label: `theme.token.${id}.label`,
            type,
            defaults: { light },
        });

        expect(() =>
            parseCollectionRelease(collectionFixture(themed([token("first", "color", "var(--atlas-missing)")]))),
        ).toThrow("unknown or unimported");
        expect(() =>
            parseCollectionRelease(
                collectionFixture(
                    themed([token("first", "color", "var(--atlas-second)"), token("second", "length", "1rem")]),
                ),
            ),
        ).toThrow("cannot use length");
        expect(() =>
            parseCollectionRelease(
                collectionFixture(
                    themed([
                        token("first", "color", "var(--atlas-second)"),
                        token("second", "color", "var(--atlas-first)"),
                    ]),
                ),
            ),
        ).toThrow("cyclic theme token");
    });

    test("declares font faces as typed theme entries backed by local WOFF2 assets", () => {
        const source = collectionDocument({
            "theme.category.typography.label": "Typography",
            "theme.label": "Atlas theme",
            "theme.token.body.label": "Body font",
        });
        source.assets = [
            {
                id: "fonts/interface.woff2",
                mediaType: "font/woff2",
                byteLength: 0,
                digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            },
        ];
        source.theme = {
            label: "theme.label",
            categories: [
                {
                    id: "typography",
                    label: "theme.category.typography.label",
                    entries: [
                        {
                            id: "interface",
                            type: "font-face",
                            asset: "fonts/interface.woff2",
                            family: "interface",
                            style: "normal",
                            weight: "100 900",
                            display: "swap",
                        },
                        {
                            id: "body",
                            label: "theme.token.body.label",
                            type: "font-family",
                            defaults: { light: '"atlas-interface", sans-serif' },
                        },
                    ],
                },
            ],
        };

        const parsed = parseCollectionRelease(collectionFixture(source));
        expect(parsed.theme?.categories[0]?.entries[0]).toMatchObject({
            type: "font-face",
            asset: "fonts/interface.woff2",
            family: "interface",
            weight: "100 900",
        });

        (source.theme as { categories: { entries: Record<string, unknown>[] }[] }).categories[0]!
            .entries[0]!.generation = 2;
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow('unknown property "generation"');
        delete (source.theme as { categories: { entries: Record<string, unknown>[] }[] }).categories[0]!.entries[0]!
            .generation;

        (source.assets as Record<string, unknown>[])[0]!.mediaType = "font/ttf";
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow("local WOFF2 asset");
    });

    test("enforces ownership of Bloc CSS variables", () => {
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
                    entries: [
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
        const panel = (source.blocs as Record<string, unknown>[])[0]!;

        panel.style = ":scope { --random-color: red; }";
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/must belong to Bloc atlas-panel/);

        panel.style = ":scope { color: var(--atlas-missing, red); }";
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(
            /must belong to this Bloc, a Bloc declared in uses, or the theme/,
        );

        panel.style = ":scope { color: var(--atlas-panel-color); }";
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(
            /neither declared nor provided with a fallback/,
        );

        panel.style = ":scope { --atlas-panel-color: var(--atlas-accent); color: var(--atlas-panel-color); }";
        expect(parseCollectionRelease(collectionFixture(source)).blocs).toHaveLength(2);
    });

    test("allows a Bloc to configure only dependencies declared in uses", () => {
        const source = collectionDocument();
        const panel = (source.blocs as Record<string, unknown>[])[0]!;
        const child = {
            description: "bloc.panel.label",
            categories: ["bloc.panel.label"],

            kind: "component",
            id: "atlas-action",
            label: "bloc.panel.label",
            markup: '<section><slot name="body"></slot></section>',
            root: { accepts: ["div"] },
            slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            uses: [],
            requires: [],
        };
        (source.blocs as Record<string, unknown>[]).push(child);
        panel.style = ":scope { --atlas-action-color: red; color: var(--atlas-action-color); }";
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/declared in uses/);

        panel.uses = ["atlas-action"];
        expect(parseCollectionRelease(collectionFixture(source)).blocs).toHaveLength(3);
    });

    test("rejects every undeclared theme variable", () => {
        const input = collectionDocument({
            "theme.label": "Theme",
            "theme.category.colors.label": "Colors",
            "theme.token.surface.label": "Surface",
        });
        input.theme = {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.category.colors.label",
                    entries: [
                        {
                            id: "surface",
                            label: "theme.token.surface.label",
                            type: "color",
                            defaults: { light: "var(--host-surface, white)" },
                        },
                    ],
                },
            ],
        };
        expect(() => parseCollectionRelease(collectionFixture(input))).toThrow(
            "unknown or unimported theme token --host-surface",
        );
    });

    test("declares selective exports and cross-collection imports", () => {
        const source = collectionDocument({
            "page.overview.name": "Overview",
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
                    entries: [
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
        source.states = [
            {
                id: "filters",
                scope: "page",
                schema: {
                    type: "object",
                    properties: { search: { type: "string", maxLength: 100 } },
                    required: ["search"],
                },
            },
        ];
        source.exports = {
            blocs: ["atlas-panel"],
            themeTokens: ["accent"],

            states: ["filters"],
        };
        source.dependencies = [
            {
                collectionId: "ulvia-official",
                publisherId: "ulvia.official",
                versionRange: "^1.0.0",
                imports: {
                    blocs: [{ id: "ulvia-official-button" }],
                    themeTokens: [{ id: "primary" }],

                    states: [{ id: "selection" }],
                },
            },
        ];
        (((source.blocs as Record<string, unknown>[])[0]!.slots as Record<string, any>).body.accepts as any[]).push({
            kind: "component",
            tag: "ulvia-official-button",
        });
        (source.blocs as Record<string, unknown>[])[1]!.uses = ["atlas-panel", "ulvia-official-button"];
        (source.blocs as Record<string, unknown>[])[1]!.markup =
            '<div cms-bloc=\"atlas-panel\"><slot name="main" slot="body"></slot><div cms-bloc=\"ulvia-official-button\" slot="body"></div></div>';

        const parsed = parseCollectionRelease(collectionFixture(source));
        expect(parsed.exports).toEqual({
            blocs: ["atlas-panel"],
            themeTokens: ["accent"],

            states: ["filters"],
        });
        expect(parsed.states).toEqual([
            {
                id: "filters",

                scope: "page",
                schema: {
                    type: "object",
                    properties: { search: { type: "string", maxLength: 100 } },
                    required: ["search"],
                },
            },
        ]);
        expect(parsed.dependencies?.[0]).toEqual({
            collectionId: "ulvia-official",
            publisherId: "ulvia.official",
            versionRange: "^1.0.0",
            imports: {
                blocs: [{ id: "ulvia-official-button" }],
                themeTokens: [{ id: "primary" }],

                states: [{ id: "selection" }],
            },
        });

        expect(() =>
            parseCollectionRelease(
                collectionFixture({ ...source, exports: { blocs: ["atlas-missing"], themeTokens: [] } }),
            ),
        ).toThrow("unknown exported bloc");
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...source,
                    dependencies: (source.dependencies as Record<string, unknown>[]).map((dependency) => ({
                        ...dependency,
                        imports: { blocs: [], themeTokens: [] },
                    })),
                }),
            ),
        ).toThrow("at least one");
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...source,
                    dependencies: (source.dependencies as Record<string, unknown>[]).map((dependency) => ({
                        ...dependency,
                        imports: {
                            blocs: ["ulvia-official-button"],
                            themeTokens: [{ id: "primary" }],
                        },
                    })),
                }),
            ),
        ).toThrow(/object/);
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...source,
                    dependencies: (source.dependencies as Record<string, unknown>[]).map((dependency) => ({
                        ...dependency,
                        imports: {
                            blocs: [{ id: "ulvia-official-button" }],
                            themeTokens: [{ id: "primary" }],
                        },
                    })),
                }),
            ),
        ).not.toThrow();
    });

    test("rejects binary state and non-string URL parameter contracts", () => {
        for (const state of [
            { id: "file", scope: "page", schema: { type: "binary", maxBytes: 10 } },
            {
                id: "filters",
                scope: "param",
                schema: { type: "object", properties: {}, required: [] },
            },
            { id: "page", scope: "param", schema: { type: "integer", minimum: 1 } },
            { id: "enabled", scope: "param", schema: { type: "boolean" } },
        ]) {
            expect(() =>
                parseCollectionRelease(collectionFixture({ ...collectionDocument(), states: [state] })),
            ).toThrow();
        }
    });

    test("rejects collection-owned state keys above the browser binding limit", () => {
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...collectionDocument(),
                    collectionId: `atlas-${"a".repeat(90)}`,
                    states: [
                        {
                            id: "selection-that-cannot-fit-the-runtime-key-limit",
                            scope: "page",
                            schema: { type: "string", maxLength: 64 },
                        },
                    ],
                }),
            ),
        ).toThrow("at most 128 characters");
    });

    test("validates collection ownership for declarative state bindings", () => {
        const source = collectionDocument();
        source.states = [
            {
                id: "products",
                scope: "page",
                schema: { type: "array", items: { type: "string", maxLength: 64 }, maxItems: 20 },
            },
        ];
        (source.blocs as Record<string, unknown>[])[1]!.markup =
            '<div cms-bloc=\"atlas-panel\" cms-query="@page:atlas-products as products"><slot name="main" slot="body"><p>{{ products.data[0] }}</p></slot></div>';
        expect(parseCollectionRelease(collectionFixture(source)).states?.[0]?.id).toBe("products");

        (source.blocs as Record<string, unknown>[])[1]!.markup =
            '<div cms-bloc=\"atlas-panel\" cms-queries="@page:atlas-products as products"><slot name="main" slot="body"><p>{{ products.data[0] }}</p></slot></div>';
        expect(parseCollectionRelease(collectionFixture(source)).states?.[0]?.id).toBe("products");

        (source.blocs as Record<string, unknown>[])[1]!.markup =
            '<div cms-bloc=\"atlas-panel\" cms-queries="@page:atlas-undeclared as products"><slot name="main" slot="body"></slot></div>';
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(
            "declared locally or explicitly imported",
        );

        (source.blocs as Record<string, unknown>[])[1]!.markup =
            '<div cms-bloc=\"atlas-panel\" cms-query="@page:atlas-undeclared as products"><slot name="main" slot="body"><p>{{ products.data[0] }}</p></slot></div>';
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(
            "declared locally or explicitly imported",
        );

        (source.blocs as Record<string, unknown>[])[1]!.markup =
            '<div cms-bloc=\"atlas-panel\" cms-query="catalog:items.list as products" cms-query-listen="@page:atlas-undeclared"><slot name="main" slot="body"></slot></div>';
        (source.blocs as Record<string, unknown>[])[1]!.requires = [
            { contractId: "catalog", capabilityId: "items.list", versionRange: "^1.0.0" },
        ];
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(
            "declared locally or explicitly imported",
        );
    });

    test("validates projected query listeners against the declared state schema", () => {
        const source = collectionDocument();
        source.states = [
            {
                id: "save",
                scope: "page",
                schema: {
                    type: "object",
                    properties: {
                        lastSuccess: {
                            type: "object",
                            nullable: true,
                            properties: { requestId: { type: "string", maxLength: 128 } },
                            required: ["requestId"],
                        },
                    },
                    required: ["lastSuccess"],
                },
            },
        ];
        const consumer = (source.blocs as Record<string, unknown>[])[1]!;
        consumer.requires = [{ contractId: "catalog", capabilityId: "items.list", versionRange: "^1.0.0" }];
        consumer.markup = `<div cms-bloc=\"atlas-panel\"
            cms-query="catalog:items.list as items"
            cms-query-listen="@page:atlas-save/lastSuccess/requestId"
        ><slot name="main" slot="body"></slot></div>`;
        expect(() => parseCollectionRelease(collectionFixture(source))).not.toThrow();

        consumer.markup = `<div cms-bloc=\"atlas-panel\"
            cms-query="catalog:items.list as items"
            cms-query-listen="@page:atlas-save/lastSuccess/missing"
        ><slot name="main" slot="body"></slot></div>`;
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow("unknown state property");
    });

    test("validates known cms-sync producer types against declared state contracts", () => {
        const state = (schema: Record<string, unknown>, markup: string) => {
            const source = collectionDocument();
            source.states = [{ id: "shared", scope: "page", schema }];
            const producer = (source.blocs as Record<string, unknown>[])[1]!;
            producer.markup = markup;
            delete producer.defaultContent;
            producer.slots = {};
            producer.uses = [];
            producer.requires =
                markup.includes("cms-query") || markup.includes("cms-mutation")
                    ? [{ contractId: "catalog", capabilityId: "items.list", versionRange: "^1.0.0" }]
                    : [];
            return source;
        };

        expect(() =>
            parseCollectionRelease(
                collectionFixture(state({ type: "string", maxLength: 64 }, '<input cms-sync="@page:atlas-shared">')),
            ),
        ).not.toThrow();
        expect(() =>
            parseCollectionRelease(
                collectionFixture(state({ type: "boolean" }, '<input type="checkbox" cms-sync="@page:atlas-shared">')),
            ),
        ).not.toThrow();
        expect(() =>
            parseCollectionRelease(
                collectionFixture(
                    state(
                        { type: "object", properties: {}, required: [] },
                        '<section cms-query="catalog:items.list as items" cms-sync="@page:atlas-shared"></section>',
                    ),
                ),
            ),
        ).not.toThrow();

        expect(() =>
            parseCollectionRelease(
                collectionFixture(state({ type: "boolean" }, '<input cms-sync="@page:atlas-shared">')),
            ),
        ).toThrow("requires a nonnullable string state");
        expect(() =>
            parseCollectionRelease(
                collectionFixture(
                    state(
                        { type: "array", items: { type: "string", maxLength: 64 }, maxItems: 10 },
                        '<form cms-mutation="catalog:items.list as items" cms-sync="@page:atlas-shared"></form>',
                    ),
                ),
            ),
        ).toThrow("requires a nonnullable object state");
    });

    test("validates state input selections, casts and fallbacks against known schemas", () => {
        const source = collectionDocument();
        source.states = [
            {
                id: "filters",
                scope: "page",
                schema: {
                    type: "object",
                    properties: {
                        page: { type: "string", maxLength: 8 },
                        tags: { type: "array", items: { type: "string", maxLength: 32 }, maxItems: 10 },
                    },
                    required: [],
                },
            },
        ];
        const consumer = (source.blocs as Record<string, unknown>[])[1]!;
        consumer.requires = [{ contractId: "catalog", capabilityId: "items.list", versionRange: "^1.0.0" }];
        consumer.markup = `<div cms-bloc=\"atlas-panel\"
            cms-query="catalog:items.list as items"
            cms-query-input='{"page":{"from":"state","key":"@page:atlas-filters","path":["page"],"cast":"integer","fallback":"1"}}'
        ><slot name="main" slot="body"><p>{{ items.data }}</p></slot></div>`;
        expect(() => parseCollectionRelease(collectionFixture(source))).not.toThrow();

        for (const input of [
            '{"page":{"from":"state","key":"@page:atlas-filters","path":["missing"]}}',
            '{"page":{"from":"state","key":"@page:atlas-filters","path":["tags","first"]}}',
            '{"page":{"from":"state","key":"@page:atlas-filters","cast":"string"}}',
            '{"page":{"from":"state","key":"@page:atlas-filters","path":["page"],"fallback":12}}',
        ]) {
            consumer.markup = `<div cms-bloc=\"atlas-panel\" cms-query="catalog:items.list as items" cms-query-input='${input}'><slot name="main" slot="body"></slot></div>`;
            expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/state input/);
        }
    });

    test("rejects automatic query feedback within one Light DOM document", () => {
        const source = collectionDocument();
        source.states = ["left", "right"].map((id) => ({
            id,
            scope: "page",
            schema: { type: "object", properties: {}, required: [] },
        }));
        const producer = (source.blocs as Record<string, unknown>[])[1]!;
        producer.requires = [{ contractId: "catalog", capabilityId: "items.list", versionRange: "^1.0.0" }];
        producer.slots = {};
        producer.uses = [];
        producer.markup = `<section>
            <div cms-query="catalog:items.list as left" cms-query-input='{"right":{"from":"state","key":"@page:atlas-right"}}' cms-query-listen="@page:atlas-right" cms-sync="@page:atlas-left"></div>
            <div cms-query="catalog:items.list as right" cms-query-input='{"left":{"from":"state","key":"@page:atlas-left"}}' cms-query-listen="@page:atlas-left" cms-sync="@page:atlas-right"></div>
        </section>`;
        delete producer.defaultContent;
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/automatic state query cycle/);

        producer.markup = `<section>
            <div cms-query="catalog:items.list as first" cms-sync="@page:atlas-left"></div>
            <div cms-query="catalog:items.list as second" cms-sync="@page:atlas-left"></div>
        </section>`;
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow(/multiple automatic query producers/);
    });

    test("validates reusable translation keys and locale fallback", () => {
        const source = collectionDocument({ "theme.label": "Atlas theme" });
        (source.translations as Record<string, Record<string, string>>).fr = {
            "collection.name": "Interface Atlas",
            "theme.label": "Thème Atlas",
        };
        const parsed = parseCollectionRelease(
            collectionFixture({
                ...source,
                theme: { label: "theme.label", categories: [] },
            }),
        );
        expect(resolveCollectionTranslation(parsed, "theme.label", "fr-FR")).toBe("Thème Atlas");
        expect(resolveCollectionTranslation(parsed, "bloc.panel.label", "fr-FR")).toBe("Panel");

        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...collectionDocument(),
                    locale: "fr",
                    translations: { en: { "collection.name": "Atlas" } },
                }),
            ),
        ).toThrow(/collection locale/);
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...collectionDocument(),
                    translations: {
                        "en-us": { "collection.name": "Atlas" },
                        "en-US": { "collection.name": "Duplicate" },
                    },
                }),
            ),
        ).toThrow(/duplicate canonical locales/);
        expect(() =>
            parseCollectionRelease(
                collectionFixture({
                    ...collectionDocument(),
                    theme: { label: "theme.missing", categories: [] },
                }),
            ),
        ).toThrow(/missing default translation/);
    });

    test("computes contract and implementation digests separately without resource generations", async () => {
        const previous = parseCollectionRelease(collectionFixture(collectionDocument()));
        const nextSource = collectionDocument();
        (nextSource.blocs as Record<string, unknown>[])[0]!.style = ":scope { display: grid; }";
        const next = parseCollectionRelease(collectionFixture({ ...nextSource, version: "1.0.1" }));
        const previousPanel = (await describeCollectionResources(previous)).find(
            (resource) => resource.id === "atlas-panel",
        )!;
        const nextPanel = (await describeCollectionResources(next)).find((resource) => resource.id === "atlas-panel")!;
        expect(previous).not.toHaveProperty("dataGeneration");
        expect(previous).not.toHaveProperty("migrations");
        expect(previousPanel).not.toHaveProperty("generation");
        expect(nextPanel.contractDigest).toBe(previousPanel.contractDigest);
        expect(nextPanel.implementationDigest).not.toBe(previousPanel.implementationDigest);

        const translatedSource = collectionDocument();
        translatedSource.translations.en!["bloc.panel.label"] = "Translated panel";
        const translatedPanel = (
            await describeCollectionResources(parseCollectionRelease(collectionFixture(translatedSource)))
        ).find((resource) => resource.id === "atlas-panel")!;
        expect(translatedPanel.contractDigest).toBe(previousPanel.contractDigest);
        expect(translatedPanel.implementationDigest).not.toBe(previousPanel.implementationDigest);

        const unrelatedSource = collectionDocument({ "unused.label": "Unrelated" });
        const unrelatedPanel = (
            await describeCollectionResources(parseCollectionRelease(collectionFixture(unrelatedSource)))
        ).find((resource) => resource.id === "atlas-panel")!;
        expect(unrelatedPanel.implementationDigest).toBe(previousPanel.implementationDigest);
    });

    test("rejects obsolete migration chains and resource generations", () => {
        for (const extra of [{ dataGeneration: 1 }, { migrations: [] }]) {
            expect(() => parseCollectionRelease(collectionFixture({ ...collectionDocument(), ...extra }))).toThrow(
                "unknown property",
            );
        }
        const source = collectionDocument();
        (source.blocs as Record<string, unknown>[])[0]!.generation = 1;
        expect(() => parseCollectionRelease(collectionFixture(source))).toThrow('unknown property "generation"');
    });
});

import { expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import {
    registerAccessCapabilities,
    registerLocalizationCapabilities,
    registerThemeCapabilities,
} from "@bernouy/ulvia-provider/capabilities";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
};

test("access overview retries until settings and revision belong to one snapshot", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const oldSystem = defaultSystem();
    oldSystem.site.name = "Old";
    const currentSystem = defaultSystem();
    currentSystem.site.name = "Current";
    const revisions = [1, 2, 2, 2];
    const systems = [oldSystem, currentSystem];
    registerAccessCapabilities(
        dispatcher,
        {
            repo: {
                getSystemRevision: async () => revisions.shift() ?? 2,
                getSystem: async () => structuredClone(systems.shift() ?? currentSystem),
            },
            users: { list: async () => ({ users: [], total: 0, page: 1, limit: 50, hasMore: false }) },
            identityProviders: { list: async () => [] },
        } as never,
        { administrators: { list: async () => [] } } as never,
    );

    const output = await dispatcher.invoke("ulvia.cms.access", "overview", {}, context);
    expect(output.site).toMatchObject({ name: "Current", revision: 2 });
});

test("settings commands return the revision committed by their own compare-and-swap", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    const repo = {
        getSystemRevision: async () => {
            throw new Error("a successful command must not re-read a later revision");
        },
        updateSystem: async (update: Record<string, unknown>, expectedRevision: number) => {
            if (expectedRevision === 4) {
                system.site.name = (update.site as { name: string }).name;
            } else {
                const site = update.site as {
                    language: string;
                    additionalLanguages: string[];
                    activeLanguages: string[];
                };
                Object.assign(system.site, site);
            }
            return structuredClone(system);
        },
    };
    const core = { repo } as never;
    registerAccessCapabilities(dispatcher, core, undefined);
    registerLocalizationCapabilities(dispatcher, core);

    const site = await dispatcher.invoke(
        "ulvia.cms.access",
        "update-site",
        { expectedRevision: 4, name: "Renamed" },
        context,
    );
    expect(site).toMatchObject({ revision: 5, name: "Renamed" });

    const languages = await dispatcher.invoke(
        "ulvia.cms.localization",
        "update-languages",
        { expectedRevision: 5, language: "fr", additionalLanguages: ["en"], activeLanguages: ["fr", "en"] },
        context,
    );
    expect(languages).toMatchObject({ revision: 6, language: "fr", activeLanguages: ["fr", "en"] });
});

test("localization overview uses the collection locale before a fresh site selects its language", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    system.site.language = "";
    registerLocalizationCapabilities(dispatcher, {
        repo: {
            getSystemRevision: async () => 1,
            getSystem: async () => structuredClone(system),
        },
        collections: {
            snapshot: async () => ({
                revision: 1,
                collections: [
                    {
                        collectionId: "example",
                        textOverrides: {},
                        release: {
                            kind: "collection",
                            protocol: "ulvia-collection/v1",
                            schemaDialect: "ulvia-schema/v1",
                            collectionId: "example",
                            publisherId: "example.publisher",
                            version: "1.0.0",
                            dataGeneration: 1,
                            migrations: [],
                            name: "collection.name",
                            locale: "en",
                            translations: { en: { "collection.name": "Example", "theme.label": "Example theme" } },
                            assets: [],
                            blocs: [],
                            theme: { label: "theme.label", categories: [] },
                        },
                    },
                ],
            }),
        },
    } as never);

    const output = await dispatcher.invoke("ulvia.cms.localization", "overview", {}, context);
    expect(output.language).toBe("en");
});

test("localization reads and saves canonical text-first multilingual overrides", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let revision = 4;
    let textOverrides: Record<string, Record<string, string>> = {
        greeting: { en: "Hello site", fr: "Bonjour site" },
    };
    const installation = () => ({
        collectionId: "example",
        textOverrides,
        release: {
            collectionId: "example",
            locale: "en",
            texts: [
                {
                    id: "greeting",
                    label: "text.greeting.label",
                    category: "text.category.label",
                    group: "text.group.label",
                    values: { en: "Hello", fr: "Bonjour" },
                },
            ],
            translations: {
                en: {
                    "text.greeting.label": "Greeting",
                    "text.category.label": "Copy",
                    "text.group.label": "General",
                },
            },
        },
    });
    registerLocalizationCapabilities(dispatcher, {
        repo: {},
        collections: {
            snapshot: async () => ({ revision, collections: [installation()] }),
            saveTexts: async (_siteId: string, _collectionId: string, expectedRevision: number, next: unknown) => {
                expect(expectedRevision).toBe(revision);
                textOverrides = next as typeof textOverrides;
                revision += 1;
                return { revision, collections: [installation()] };
            },
        },
    } as never);

    const initial = await dispatcher.invoke(
        "ulvia.cms.localization",
        "get-texts",
        { collectionId: "example", locale: "fr" },
        context,
    );
    expect(initial.items[0]!.overrides).toEqual([
        { locale: "en", value: "Hello site" },
        { locale: "fr", value: "Bonjour site" },
    ]);

    const saved = await dispatcher.invoke(
        "ulvia.cms.localization",
        "save-texts",
        {
            collectionId: "example",
            expectedRevision: 4,
            locale: "fr",
            overridesJson: JSON.stringify({ greeting: { en: "Hello site", fr: "Salut" } }),
        },
        context,
    );
    expect(saved.revision).toBe(5);
    expect(saved.items[0]!.overrides).toContainEqual({ locale: "fr", value: "Salut" });
    expect(textOverrides).toEqual({ greeting: { en: "Hello site", fr: "Salut" } });
});

test("theme reads compose the authoritative token catalogues from installed collections", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    system.site.language = "fr";
    registerThemeCapabilities(dispatcher, {
        repo: {
            getSystemRevision: async () => 3,
            getSystem: async () => structuredClone(system),
        },
        collections: {
            snapshot: async () => ({
                revision: 5,
                collections: [
                    {
                        collectionId: "example",
                        textOverrides: {},
                        release: {
                            collectionId: "example",
                            publisherId: "example.publisher",
                            version: "1.0.0",
                            locale: "fr",
                            translations: {
                                fr: {
                                    "theme.label": "Thème exemple",
                                    "category.colors": "Couleurs",
                                    "token.primary": "Primaire",
                                },
                            },
                            assets: [],
                            blocs: [],
                            theme: {
                                label: "theme.label",
                                categories: [
                                    {
                                        id: "colors",
                                        label: "category.colors",
                                        tokens: [
                                            {
                                                id: "primary",
                                                label: "token.primary",
                                                type: "color",
                                                defaults: { light: "#3b5ccc", dark: "#9bb1ff" },
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
            }),
        },
    } as never);

    const output = await dispatcher.invoke("ulvia.cms.theme", "get", {}, context);
    const theme = JSON.parse(output.themeJson as string);
    expect(output.revision).toBe(3);
    expect(theme.sources).toContainEqual(
        expect.objectContaining({
            label: "Thème exemple",
            owner: { kind: "contribution", contributionId: "example" },
            categories: [
                expect.objectContaining({
                    label: "Couleurs",
                    tokens: [expect.objectContaining({ id: "example-primary", label: "Primaire" })],
                }),
            ],
        }),
    );
});

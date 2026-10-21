import { expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
};

test("content site reads retry until settings and revision belong to one snapshot", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const oldSystem = defaultSystem();
    oldSystem.site.name = "Old";
    const currentSystem = defaultSystem();
    currentSystem.site.name = "Current";
    const revisions = [1, 2, 2, 2];
    const systems = [oldSystem, currentSystem];
    registerContentCapabilities(dispatcher, {
        repo: {
            getSystemRevision: async () => revisions.shift() ?? 2,
            getSystem: async () => structuredClone(systems.shift() ?? currentSystem),
        } as never,
    } as never);

    const output = await dispatcher.invoke("ulvia.cms.content", "site.get", {}, context);
    expect(output).toMatchObject({ name: "Current", revision: 2 });
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
    registerContentCapabilities(dispatcher, core);

    const site = await dispatcher.invoke(
        "ulvia.cms.content",
        "site.update",
        { expectedRevision: 4, name: "Renamed" },
        context,
    );
    expect(site).toMatchObject({ revision: 5, name: "Renamed" });

    const languages = await dispatcher.invoke(
        "ulvia.cms.content",
        "localization.update",
        { expectedRevision: 5, language: "fr", additionalLanguages: ["en"], activeLanguages: ["fr", "en"] },
        context,
    );
    expect(languages).toMatchObject({ revision: 6, language: "fr", activeLanguages: ["fr", "en"] });
});

test("localization settings use the collection locale before a fresh site selects its language", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    system.site.language = "";
    registerContentCapabilities(dispatcher, {
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

    const output = await dispatcher.invoke("ulvia.cms.content", "localization.get", {}, context);
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
    registerContentCapabilities(dispatcher, {
        repo: {
            getSystemRevision: async () => 2,
            getSystem: async () => {
                const system = defaultSystem();
                system.site.language = "en";
                system.site.activeLanguages = ["en", "fr"];
                return system;
            },
        },
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
        "ulvia.cms.content",
        "localization.texts.get",
        { collectionId: "example", locale: "fr" },
        context,
    );
    expect(initial).toMatchObject({
        locale: "fr",
        locales: ["en", "fr"],
        group: "General",
        items: [{ id: "greeting", sourceValue: "Bonjour", overrideValue: "Bonjour site" }],
    });

    const saved = await dispatcher.invoke(
        "ulvia.cms.content",
        "localization.text.save",
        {
            collectionId: "example",
            expectedRevision: 4,
            locale: "fr",
            textId: "greeting",
            value: "Salut",
        },
        context,
    );
    expect(saved).toEqual({
        revision: 5,
        collectionId: "example",
        textId: "greeting",
        locale: "fr",
        overridden: true,
    });
    expect(textOverrides).toEqual({ greeting: { en: "Hello site", fr: "Salut" } });

    await dispatcher.invoke(
        "ulvia.cms.content",
        "localization.text.save",
        { collectionId: "example", expectedRevision: 5, locale: "fr", textId: "greeting", value: "" },
        context,
    );
    expect(textOverrides).toEqual({ greeting: { en: "Hello site" } });
});

test("theme reads compose the authoritative token catalogues from installed collections", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    system.site.language = "fr";
    registerContentCapabilities(dispatcher, {
        repo: {
            getSystemRevision: async () => 3,
            getSystem: async () => structuredClone(system),
            updateSystem: async (update: { theme: typeof system.theme }, expectedRevision: number) => {
                expect(expectedRevision).toBe(3);
                system.theme = structuredClone(update.theme);
                return structuredClone(system);
            },
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
                                        entries: [
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

    const output = await dispatcher.invoke("ulvia.cms.content", "theme.get", { collectionId: "example" }, context);
    expect(output).toMatchObject({
        revision: 3,
        collectionId: "example",
        sourceFound: true,
        sourceLabel: "Thème exemple",
        profileId: "default",
        mode: "light",
        token: {
            id: "example-primary",
            label: "Primaire",
            categoryLabel: "Couleurs",
            value: "#3b5ccc",
            overridden: false,
        },
    });

    const saved = await dispatcher.invoke(
        "ulvia.cms.content",
        "theme.token.save",
        {
            expectedRevision: 3,
            themeId: "default",
            mode: "light",
            tokenId: "example-primary",
            value: "#123456",
        },
        context,
    );
    expect(saved).toMatchObject({ value: "#123456", overridden: true });
    expect(system.theme.themes[0]!.values.light["example-primary"]).toBe("#123456");
});

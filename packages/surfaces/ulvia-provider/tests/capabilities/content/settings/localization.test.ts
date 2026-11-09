import { expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "../mount";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.1.0",
    siteId: "default",
    providerId: "ulvia/primary-provider",
};

test("localization settings use the collection locale before a fresh site selects its language", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    system.site.language = "";
    await mountContentForTest(dispatcher, {
        repo: {
            getSystemRevision: async () => 1,
            getSystem: async () => structuredClone(system),
        },
        collections: {
            snapshot: async () => ({
                revision: 1,
                collections: [
                    {
                        collectionId: "example.publisher/example",
                        textOverrides: {},
                        release: {
                            kind: "collection",
                            protocol: "ulvia-collection/v1",
                            schemaDialect: "ulvia-schema/v1",
                            collectionId: "example.publisher/example",
                            publisherId: "example.publisher",
                            version: "1.0.0",
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

    const output = await dispatcher.invoke("ulvia/cms.content", "localization.get", {}, context);
    expect(output).toMatchObject({ language: "en" });
});

test("localization reads and saves canonical text-first multilingual overrides", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let revision = 4;
    let textOverrides: Record<string, Record<string, string>> = {
        greeting: { en: "Hello site", fr: "Bonjour site" },
    };
    const installation = () => ({
        collectionId: "example.publisher/example",
        textOverrides,
        release: {
            collectionId: "example.publisher/example",
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
    await mountContentForTest(dispatcher, {
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
        "ulvia/cms.content",
        "localization.texts.get",
        { collectionId: "example.publisher/example", locale: "fr" },
        context,
    );
    expect(initial).toMatchObject({
        locale: "fr",
        locales: ["en", "fr"],
        group: "General",
        items: [{ id: "greeting", sourceValue: "Bonjour", overrideValue: "Bonjour site" }],
    });

    const saved = await dispatcher.invoke(
        "ulvia/cms.content",
        "localization.text.save",
        {
            collectionId: "example.publisher/example",
            expectedRevision: 4,
            locale: "fr",
            textId: "greeting",
            value: "Salut",
        },
        context,
    );
    expect(saved).toEqual({
        revision: 5,
        collectionId: "example.publisher/example",
        textId: "greeting",
        locale: "fr",
        overridden: true,
    });
    expect(textOverrides).toEqual({ greeting: { en: "Hello site", fr: "Salut" } });

    await dispatcher.invoke(
        "ulvia/cms.content",
        "localization.text.save",
        { collectionId: "example.publisher/example", expectedRevision: 5, locale: "fr", textId: "greeting", value: "" },
        context,
    );
    expect(textOverrides).toEqual({ greeting: { en: "Hello site" } });
});

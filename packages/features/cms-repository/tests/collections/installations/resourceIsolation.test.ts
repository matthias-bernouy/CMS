import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";

function release(collectionId: string, version: string, blocId: string, tokenId?: string) {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId,
        publisherId: "atlas.official",
        version,
        name: "collection.name",
        locale: "en",
        translations: {
            en: {
                "bloc.welcome.label": "Welcome",
                "collection.name": collectionId,
                "theme.category.colors.label": "Colors",
                "theme.label": "Theme",
                "theme.token.accent.label": "Accent",
            },
        },
        assets: [],
        blocs: [
            {
                kind: "composition",
                id: blocId,
                label: "bloc.welcome.label",
                lightdom: "<p>Hello</p>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
        ...(tokenId
            ? {
                  theme: {
                      label: "theme.label",
                      categories: [
                          {
                              id: "colors",
                              label: "theme.category.colors.label",
                              tokens: [
                                  {
                                      id: tokenId,
                                      label: "theme.token.accent.label",
                                      type: "color",
                                      defaults: { light: "#111111" },
                                  },
                              ],
                          },
                      ],
                  },
              }
            : {}),
    };
}

test("installations and upgrades reject global Bloc and theme token collisions", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const first = await store.importRelease(release("atlas", "1.0.0", "atlas-tools-card", "tools-accent"));
    await store.install("blocs", first.digest, 0);
    await store.install("themes", first.digest, 0);

    const blocCollision = await store.importRelease(release("atlas-tools", "0.9.0", "atlas-tools-card"));
    await expect(store.install("blocs", blocCollision.digest, 1)).rejects.toThrow("Bloc tag");

    const initialTools = await store.importRelease(release("atlas-tools", "1.0.0", "atlas-tools-welcome"));
    await store.install("themes", initialTools.digest, 1, "local");
    const themeCollision = await store.importRelease(release("atlas-tools", "1.1.0", "atlas-tools-welcome", "accent"));
    await expect(store.upgrade("themes", themeCollision.digest, 2, "local")).rejects.toThrow("theme token");
});

test("installs only declared public resources from compatible collection dependencies", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const foundation = {
        ...release("ulvia-official", "1.0.0", "ulvia-official-button", "primary"),
        publisherId: "ulvia.official",
        exports: { blocs: ["ulvia-official-button"], themeTokens: ["primary"] },
    };
    const baseConsumer = release("shop", "1.0.0", "shop-hero");
    const consumer = {
        ...baseConsumer,
        blocs: [
            {
                ...baseConsumer.blocs[0]!,
                lightdom: "<ulvia-official-button></ulvia-official-button>",
                uses: ["ulvia-official-button"],
            },
        ],
        dependencies: [
            {
                collectionId: "ulvia-official",
                publisherId: "ulvia.official",
                versionRange: "^1.0.0",
                imports: { blocs: ["ulvia-official-button"], themeTokens: ["primary"] },
            },
        ],
    };

    const foundationArtifact = await store.importRelease(foundation);
    const consumerArtifact = await store.importRelease(consumer);
    await expect(store.install("site", consumerArtifact.digest, 0)).rejects.toThrow("requires ulvia-official");
    await store.install("site", foundationArtifact.digest, 0);
    await expect(store.install("site", consumerArtifact.digest, 1)).resolves.toMatchObject({ revision: 2 });

    const breakingFoundation = { ...structuredClone(foundation), version: "2.0.0" };
    const breakingArtifact = await store.importRelease(breakingFoundation);
    await expect(store.upgrade("site", breakingArtifact.digest, 2, "local")).rejects.toThrow("requires");

    const wrongType = await store.importRelease({
        ...consumer,
        version: "1.1.0",
        translations: {
            en: {
                ...consumer.translations.en,
                "theme.category.layout.label": "Layout",
                "theme.label": "Shop theme",
                "theme.token.gap.label": "Gap",
            },
        },
        theme: {
            label: "theme.label",
            categories: [
                {
                    id: "layout",
                    label: "theme.category.layout.label",
                    tokens: [
                        {
                            id: "gap",
                            label: "theme.token.gap.label",
                            type: "length",
                            defaults: { light: "var(--ulvia-official-primary)" },
                        },
                    ],
                },
            ],
        },
    });
    await store.install("types", foundationArtifact.digest, 0);
    await expect(store.install("types", wrongType.digest, 1)).rejects.toThrow("cannot use color token");
});

test("rejects imports that the dependency does not export", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const foundation = {
        ...release("ulvia-official", "1.0.0", "ulvia-official-button"),
        publisherId: "ulvia.official",
        exports: { blocs: [], themeTokens: [] },
    };
    const baseConsumer = release("shop", "1.0.0", "shop-hero");
    const consumer = {
        ...baseConsumer,
        blocs: [
            {
                ...baseConsumer.blocs[0]!,
                lightdom: "<ulvia-official-button></ulvia-official-button>",
                uses: ["ulvia-official-button"],
            },
        ],
        dependencies: [
            {
                collectionId: "ulvia-official",
                publisherId: "ulvia.official",
                versionRange: ">=0.0.0",
                imports: { blocs: ["ulvia-official-button"], themeTokens: [] },
            },
        ],
    };

    const foundationArtifact = await store.importRelease(foundation);
    const consumerArtifact = await store.importRelease(consumer);
    await store.install("site", foundationArtifact.digest, 0);
    await expect(store.install("site", consumerArtifact.digest, 1)).rejects.toThrow("unavailable bloc");
});

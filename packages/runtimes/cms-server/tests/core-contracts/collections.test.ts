import { expect, mock, test } from "bun:test";
import { DefaultCoreCapabilityDispatcher } from "@bernouy/cms-core";
import { CollectionSources, registerCollectionCapabilities } from "@bernouy/cms-core/capabilities";

const digest = `sha256:${"a".repeat(64)}`;
const reference = {
    repositoryId: "official",
    publisherId: "ulvia.official",
    collectionId: "sample",
    version: "1.0.0",
    digest,
};
const entry = { ...reference, name: "Sample", description: "Fixture", blocCount: 1, hasTheme: false };
const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "default",
    installationId: "official",
    origin: "control" as const,
    actorKind: "administrator" as const,
};

test("collection catalogue stages only the exact repository release", async () => {
    const importRelease = mock(async () => ({
        digest,
        release: {
            publisherId: reference.publisherId,
            collectionId: reference.collectionId,
            version: reference.version,
        },
    }));
    const store = {
        snapshot: async () => ({ revision: 4, collections: [] }),
        importRelease,
    };
    const source = {
        id: "official",
        list: async () => [entry],
        get: async () => ({ release: { collectionId: "sample" }, assets: [] }),
    };
    const sources = new CollectionSources(store as never, [source]);

    expect(await sources.catalogue("default")).toMatchObject({ revision: 4, releases: [entry] });
    expect(await sources.stage([reference])).toEqual([{ digest, repositoryId: "official" }]);
    expect(importRelease).toHaveBeenCalledTimes(1);
    await expect(sources.stage([{ ...reference, digest: `sha256:${"b".repeat(64)}` }])).rejects.toMatchObject({
        code: "NOT_FOUND",
    });
});

test("collection catalogue identifies only releases with site configuration", async () => {
    const store = {
        snapshot: async () => ({
            revision: 2,
            collections: [
                {
                    collectionId: "plain",
                    digest,
                    release: { publisherId: "ulvia.official", version: "1.0.0" },
                },
                {
                    collectionId: "configured",
                    digest: `sha256:${"b".repeat(64)}`,
                    release: {
                        publisherId: "ulvia.official",
                        version: "1.0.0",
                        configuration: { schema: {}, defaults: {} },
                    },
                },
            ],
        }),
    };
    const sources = new CollectionSources(store as never, []);

    expect(await sources.catalogue("default")).toMatchObject({
        installed: [
            { collectionId: "plain", configurable: false },
            { collectionId: "configured", configurable: true },
        ],
    });
});

test("collection details expose translated metadata and the installed bloc catalogue", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    registerCollectionCapabilities(dispatcher, {
        collections: {
            snapshot: async () => ({
                revision: 7,
                collections: [
                    {
                        collectionId: "sample",
                        digest,
                        configuration: {},
                        textOverrides: {},
                        release: {
                            publisherId: "ulvia.official",
                            collectionId: "sample",
                            version: "1.0.0",
                            dataGeneration: 1,
                            locale: "en",
                            name: "collection.name",
                            description: "collection.description",
                            translations: {
                                en: {
                                    "collection.name": "Sample collection",
                                    "collection.description": "Useful building blocks.",
                                    "bloc.card.label": "Card",
                                    "bloc.card.description": "A reusable card.",
                                },
                            },
                            assets: [],
                            pages: [],
                            texts: [],
                            blocs: [
                                {
                                    id: "sample-card",
                                    label: "bloc.card.label",
                                    description: "bloc.card.description",
                                    generation: 2,
                                    internal: false,
                                    surfaces: ["control", "delivery"],
                                },
                            ],
                        },
                    },
                ],
            }),
        },
    } as never);

    await expect(
        dispatcher.invoke("ulvia.cms.collections", "get", { collectionId: "sample" }, context),
    ).resolves.toMatchObject({
        revision: 7,
        name: "Sample collection",
        description: "Useful building blocks.",
        blocs: [
            {
                id: "sample-card",
                label: "Card",
                description: "A reusable card.",
                generation: 2,
                internal: false,
                surfaces: ["control", "delivery"],
            },
        ],
    });
});

test("collection commands stage installs and require migrations for generation changes", async () => {
    const installedRelease = {
        publisherId: "ulvia.official",
        collectionId: "sample",
        version: "0.9.0",
        dataGeneration: 1,
        blocs: [],
        pages: [],
        assets: [],
        texts: [],
    };
    const targetRelease = { ...installedRelease, version: "1.0.0", dataGeneration: 2 };
    let installed = false;
    const core = {
        collections: {
            snapshot: async () => ({
                revision: installed ? 1 : 0,
                collections: installed
                    ? [{ collectionId: "sample", digest: `sha256:${"0".repeat(64)}`, release: installedRelease }]
                    : [],
            }),
            revision: async () => (installed ? 1 : 0),
            importRelease: async () => ({ digest, release: targetRelease }),
            getRelease: async () => ({ digest, release: targetRelease }),
            installMany: async () => {
                installed = true;
                return {
                    revision: 1,
                    collections: [
                        {
                            collectionId: "sample",
                            digest,
                            configuration: {},
                            textOverrides: {},
                            release: targetRelease,
                        },
                    ],
                };
            },
        },
    };
    const source = {
        id: "official",
        list: async () => [entry],
        get: async () => ({ release: targetRelease, assets: [] }),
    };
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    registerCollectionCapabilities(
        dispatcher,
        core as never,
        undefined,
        new CollectionSources(core.collections as never, [source]),
    );

    await expect(
        dispatcher.invoke("ulvia.cms.collections", "install", { expectedRevision: 0, targets: [reference] }, context),
    ).resolves.toMatchObject({ revision: 1 });
    await expect(
        dispatcher.invoke("ulvia.cms.collections", "upgrade", { expectedRevision: 1, target: reference }, context),
    ).rejects.toMatchObject({ code: "MIGRATION_REQUIRED", status: 409 });
});

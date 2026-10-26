import { expect, mock, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { CollectionSources, registerCollectionInstallationCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { collectionBrowserRisk, collectionBrowserRiskDigest } from "@bernouy/cms-repository/collections";

const digest = `sha256:${"a".repeat(64)}`;
const noBrowserRisk = collectionBrowserRisk({ blocs: [] } as never);
const noBrowserRiskDigest = collectionBrowserRiskDigest(noBrowserRisk);
const reference = {
    repositoryId: "official",
    publisherId: "ulvia.official",
    collectionId: "sample",
    version: "1.0.0",
    digest,
    approvedBrowserRiskDigest: noBrowserRiskDigest,
};
const { approvedBrowserRiskDigest: _approvedBrowserRiskDigest, ...listedReference } = reference;
const entry = {
    ...listedReference,
    browserRiskDigest: noBrowserRiskDigest,
    browserRisk: noBrowserRisk.level,
    javaScriptBlocCount: 0,
    frameBlocCount: 0,
    externalFrameOrigins: [],
    scriptsWithSameOrigin: false,
    name: "Sample",
    description: "Fixture",
    blocCount: 1,
    hasTheme: false,
};
const admittedRelease = {
    publisherId: reference.publisherId,
    collectionId: reference.collectionId,
    version: reference.version,
    name: "collection.name",
    description: "collection.description",
    locale: "en",
    translations: { en: { "collection.name": "Sample", "collection.description": "Fixture" } },
    blocs: [],
    assets: [],
};
const admittedArtifact = { digest, release: admittedRelease, assets: [] };
const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
};

test("collection catalogue stages only the exact repository release", async () => {
    const importAdmittedRelease = mock(async () => admittedArtifact);
    const store = {
        snapshot: async () => ({ revision: 4, collections: [] }),
        admitRelease: async () => admittedArtifact,
        importAdmittedRelease,
    };
    const source = {
        id: "official",
        list: async () => [entry],
        get: async () => ({ release: { collectionId: "sample" }, assets: [] }),
    };
    const sources = new CollectionSources(store as never, [source]);

    expect(await sources.catalogue("default")).toMatchObject({
        revision: 4,
        releases: [
            {
                repositoryId: "official",
                digest,
                browserRisk: "none",
                javaScriptBlocs: [],
                frameBlocs: [],
                action: "install",
            },
        ],
    });
    expect(await sources.stage([reference])).toEqual([{ digest, repositoryId: "official" }]);
    expect(importAdmittedRelease).toHaveBeenCalledTimes(1);
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
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionInstallationCapabilities(dispatcher, {
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
                                    catalogue: "listed",
                                },
                            ],
                        },
                    },
                ],
            }),
        },
    } as never);

    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "get-collection-installation",
            { collectionId: "sample" },
            context,
        ),
    ).resolves.toMatchObject({
        revision: 7,
        name: "Sample collection",
        description: "Useful building blocks.",
        blocs: [
            {
                id: "sample-card",
                label: "Card",
                description: "A reusable card.",
                catalogue: "listed",
            },
        ],
    });
});

test("collection commands stage installs and expose no direct unreviewed upgrade", async () => {
    const installedRelease = {
        publisherId: "ulvia.official",
        collectionId: "sample",
        version: "0.9.0",
        blocs: [],
        pages: [],
        assets: [],
        texts: [],
    };
    const targetRelease = { ...installedRelease, version: "1.0.0" };
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
            admitRelease: async () => ({ digest, release: targetRelease, assets: [] }),
            importAdmittedRelease: async () => ({ digest, release: targetRelease }),
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
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionInstallationCapabilities(
        dispatcher,
        core as never,
        undefined,
        new CollectionSources(core.collections as never, [source]),
    );

    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "install-collection",
            { expectedRevision: 0, targets: [reference] },
            context,
        ),
    ).resolves.toMatchObject({ revision: 1 });
    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "upgrade-collection",
            { expectedRevision: 1, target: reference },
            context,
        ),
    ).rejects.toThrow();
});

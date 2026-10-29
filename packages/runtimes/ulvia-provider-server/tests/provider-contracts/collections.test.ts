import { expect, spyOn, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { CollectionSources, registerCollectionInstallationCapabilities } from "@bernouy/ulvia-provider/capabilities";
import {
    admitCollectionRelease,
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
} from "@bernouy/cms-repository/collections";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
};
function document(collectionId = "sample") {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "ulvia.official",
        collectionId,
        version: "1.0.0",
        name: "collection.name",
        description: "collection.description",
        locale: "en",
        translations: {
            en: {
                "collection.name": "Sample collection",
                "collection.description": "Useful building blocks.",
                "bloc.card.label": "Card",
                "bloc.card.description": "A reusable card.",
            },
        },
        assets: [],
        blocs: [],
    };
}
async function fixture() {
    const artifact = await admitCollectionRelease(document());
    const browser = collectionBrowserRisk(artifact.release);
    const risk = collectionBrowserRiskDigest(browser);
    const reference = {
        repositoryId: "official",
        publisherId: "ulvia.official",
        collectionId: "sample",
        version: "1.0.0",
        digest: artifact.digest,
        approvedBrowserRiskDigest: risk,
    };
    const source: CollectionRepositorySource = {
        id: "official",
        list: async () => [
            {
                ...reference,
                name: "Sample",
                description: "Fixture",
                blocCount: 0,
                hasTheme: false,
                browserRiskDigest: risk,
                browserRisk: browser.level,
                javaScriptBlocCount: 0,
                frameBlocCount: 0,
                externalFrameOrigins: [],
                scriptsWithSameOrigin: false,
            },
        ],
        getMetadata: async () => artifact.release,
        get: async () => ({ release: artifact.release, assets: [] }),
    };
    const store = new CollectionStore(new MemoryCollectionStorage());
    return { artifact, reference, store, sources: new CollectionSources(store, [source]) };
}

test("collection catalogue stages only the exact repository release", async () => {
    const f = await fixture();
    const persist = spyOn(f.store, "importAdmittedRelease");
    expect(await f.sources.catalogue("default")).toMatchObject({
        revision: 0,
        releases: [
            {
                repositoryId: "official",
                digest: f.artifact.digest,
                browserRisk: "none",
                javaScriptBlocs: [],
                frameBlocs: [],
                action: "install",
            },
        ],
    });
    expect(persist).not.toHaveBeenCalled();
    expect(await f.sources.stage([f.reference])).toEqual([{ digest: f.artifact.digest, repositoryId: "official" }]);
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(f.sources.stage([{ ...f.reference, digest: `sha256:${"b".repeat(64)}` }])).rejects.toMatchObject({
        code: "NOT_FOUND",
    });
});

test("collection catalogue identifies only releases with site configuration", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const plain = await store.importRelease(document("plain"));
    const configured = await store.importRelease({
        ...document("configured"),
        configuration: {
            schema: { type: "object", properties: {}, required: [] },
            defaults: {},
        },
    });
    await store.installMany("default", [{ digest: plain.digest }, { digest: configured.digest }], 0);
    expect(await new CollectionSources(store, []).catalogue("default")).toMatchObject({
        installed: [
            { collectionId: "plain", configurable: false },
            { collectionId: "configured", configurable: true },
        ],
    });
});

test("collection details expose translated metadata without revalidating unrelated examples", async () => {
    const f = await fixture();
    const artifact = await f.store.importRelease({
        ...document(),
        blocs: [
            {
                kind: "component",
                id: "sample-card",
                root: { accepts: ["div"] },
                catalogue: "hidden",
                label: "bloc.card.label",
                description: "bloc.card.description",
                categories: ["bloc.card.label"],
                markup: "<div></div>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    });
    await f.store.install("default", artifact.digest, 0);
    const snapshot = spyOn(f.store, "snapshot").mockImplementation(async () => {
        throw new Error("Unexpected graph audit");
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionInstallationCapabilities(dispatcher, { collections: f.store } as never);
    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "get-collection-installation",
            { collectionId: "sample" },
            context,
        ),
    ).resolves.toMatchObject({
        revision: 1,
        name: "Sample collection",
        description: "Useful building blocks.",
        blocs: [
            {
                id: "sample-card",
                label: "Card",
                description: "A reusable card.",
                catalogue: "hidden",
            },
        ],
    });
    expect(snapshot).not.toHaveBeenCalled();
});

test("collection commands stage installs and expose no direct unreviewed upgrade", async () => {
    const f = await fixture();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionInstallationCapabilities(dispatcher, { collections: f.store } as never, undefined, f.sources);
    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "install-collection",
            { expectedRevision: 0, targets: [f.reference] },
            context,
        ),
    ).resolves.toMatchObject({ revision: 1 });
    await expect(
        dispatcher.invoke(
            "ulvia.cms.installations",
            "upgrade-collection",
            { expectedRevision: 1, target: f.reference },
            context,
        ),
    ).rejects.toThrow();
});

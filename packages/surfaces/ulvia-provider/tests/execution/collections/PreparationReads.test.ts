import { expect, test } from "bun:test";
import { CollectionSources } from "@bernouy/ulvia-provider";
import {
    admitCollectionRelease,
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
} from "@bernouy/cms-repository/collections";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";

async function fixture() {
    const artifact = await admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "example.official",
        collectionId: "example",
        version: "1.0.0",
        name: "name",
        locale: "en",
        translations: { en: { name: "Example" } },
        assets: [],
        blocs: [],
    });
    const risk = collectionBrowserRiskDigest(collectionBrowserRisk(artifact.release));
    let lists = 0;
    let downloads = 0;
    const source: CollectionRepositorySource = {
        id: "official",
        list: async () => {
            lists++;
            await Bun.sleep(1);
            return [
                {
                    repositoryId: "official",
                    publisherId: "example.official",
                    collectionId: "example",
                    version: "1.0.0",
                    digest: artifact.digest,
                    name: "Example",
                    description: "",
                    blocCount: 0,
                    hasTheme: false,
                    browserRisk: "none",
                    browserRiskDigest: risk,
                    javaScriptBlocCount: 0,
                    frameBlocCount: 0,
                    externalFrameOrigins: [],
                    scriptsWithSameOrigin: false,
                },
            ];
        },
        getMetadata: async () => artifact.release,
        get: async () => {
            downloads++;
            return { release: artifact.release, assets: [] };
        },
    };
    const store = new CollectionStore(new MemoryCollectionStorage());
    const target = {
        repositoryId: "official",
        publisherId: "example.official",
        collectionId: "example",
        version: "1.0.0",
        digest: artifact.digest,
        approvedBrowserRiskDigest: risk,
    };
    return { store, sources: new CollectionSources(store, [source]), target, counts: () => ({ lists, downloads }) };
}

test("a concurrent preparation batch shares one pending catalogue and one immutable bundle", async () => {
    const f = await fixture();
    expect(await f.sources.prepare(Array.from({ length: 12 }, () => f.target))).toHaveLength(12);
    expect(f.counts()).toEqual({ lists: 1, downloads: 1 });
    await f.sources.prepare([f.target]);
    expect(f.counts()).toEqual({ lists: 2, downloads: 1 });
});

test("warm bundle reuse never caches current contract dependency availability", async () => {
    const f = await fixture();
    await f.sources.prepare([f.target]);
    f.store.validateReleaseRequirements = async () => {
        throw new Error("Required contract was yanked");
    };
    await expect(f.sources.prepare([f.target])).rejects.toThrow("Required contract was yanked");
    expect(f.counts()).toEqual({ lists: 2, downloads: 1 });
});

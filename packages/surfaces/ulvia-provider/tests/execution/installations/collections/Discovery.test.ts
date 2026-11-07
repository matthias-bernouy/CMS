import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import type { CollectionRepositoryEntry, CollectionRepositorySource } from "@bernouy/repository/collections/sources";
import { CollectionSources, CollectionSourceCaches } from "../../../../src/capabilities/installations/sources";

async function fixture() {
    const artifact = await admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "test/collection",
        publisherId: "test",
        version: "1.0.0",
        name: "name",
        locale: "en",
        translations: { en: { name: "Verified name" } },
        blocs: [],
        assets: [],
    });
    const entry: CollectionRepositoryEntry = {
        repositoryId: "repository",
        publisherId: "test",
        collectionId: "test/collection",
        version: "1.0.0",
        digest: artifact.digest,
        name: "Discovery hint",
        description: "",
        blocCount: 0,
        hasTheme: false,
        browserRisk: "high",
        browserRiskDigest: `sha256:${"f".repeat(64)}`,
        javaScriptBlocCount: 0,
        frameBlocCount: 0,
        externalFrameOrigins: [],
        scriptsWithSameOrigin: false,
    };
    let metadata = 0;
    const pages: unknown[] = [];
    const source: CollectionRepositorySource = {
        id: "repository",
        list: async () => {
            throw new Error("Must not enumerate release history");
        },
        page: async (input) => {
            pages.push(input);
            return { entries: [entry] };
        },
        getMetadata: async () => {
            metadata++;
            return artifact.release;
        },
        get: async () => ({ release: artifact.release, assets: [] }),
    };
    const store = {
        listInstalled: async (siteId: string) => ({
            revision: siteId === "a" ? 3 : 8,
            items: siteId === "a" ? [{ collectionId: "test/collection", version: "0.9.0", digest: "old" }] : [],
        }),
    };
    return { artifact, entry, source, store, pages, metadata: () => metadata };
}

test("discovery reads one bounded page without release history or binary hydration or cross-site installation state", async () => {
    const f = await fixture();
    const sources = new CollectionSources(f.store as never, [f.source]);
    const page = await sources.discovery.list("a", { limit: 10 });
    expect(page).toMatchObject({
        revision: 3,
        releases: [{ action: "upgrade", installedVersion: "0.9.0", browserRisk: "none", name: "Verified name" }],
    });
    expect(f.pages).toEqual([{ mode: "latest", channel: "stable", limit: 10 }]);
    expect(f.metadata()).toBe(1);
    expect((await sources.discovery.list("b", {})).releases[0]).toMatchObject({ action: "install" });
    expect((await sources.discovery.list("b", {})).releases[0]).not.toHaveProperty("installedVersion");
});

test("review derives authority from exact verified bytes and shares only immutable evidence across instance lifetimes", async () => {
    const f = await fixture();
    const caches = new CollectionSourceCaches();
    const first = new CollectionSources(f.store as never, [f.source], undefined, caches);
    expect(await first.discovery.review("a", f.entry)).toMatchObject({ name: "Verified name", browserRisk: "none" });
    const second = new CollectionSources(f.store as never, [f.source], undefined, caches);
    await second.discovery.review("b", f.entry);
    expect(f.metadata()).toBe(1);
    await expect(
        second.discovery.review("b", { ...f.entry, digest: `sha256:${"0".repeat(64)}` }),
    ).rejects.toMatchObject({
        code: "RELEASE_MISMATCH",
    });
    await expect(second.discovery.review("b", { ...f.entry, collectionId: "test/foreign" })).rejects.toMatchObject({
        code: "RELEASE_MISMATCH",
    });
});

test("history is bounded to one repository and collection; invalid cursors and limits fail before remote reads", async () => {
    const f = await fixture();
    const sources = new CollectionSources(f.store as never, [f.source]);
    await sources.discovery.history("a", {
        repositoryId: "repository",
        publisherId: "test",
        collectionId: "test/collection",
        limit: 2,
    });
    expect(f.pages).toEqual([
        { mode: "history", channel: "all", limit: 2, publisherId: "test", collectionId: "test/collection" },
    ]);
    for (const input of [{ limit: 0 }, { limit: 101 }, { channel: "bad" }, { cursor: "invalid" }]) {
        await expect(sources.discovery.list("a", input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(f.pages).toHaveLength(1);
});

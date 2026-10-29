import { expect, test } from "bun:test";
import { CollectionSources } from "@bernouy/ulvia-provider";
import {
    admitCollectionRelease,
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
} from "@bernouy/cms-repository/collections";
import type {
    CollectionRepositoryEntry,
    CollectionRepositorySource,
} from "@bernouy/cms-repository/collections/sources";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";

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
    let entries: CollectionRepositoryEntry[] = [
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
            browserRiskDigest: collectionBrowserRiskDigest(collectionBrowserRisk(artifact.release)),
            javaScriptBlocCount: 0,
            frameBlocCount: 0,
            externalFrameOrigins: [],
            scriptsWithSameOrigin: false,
        },
    ];
    const counts = { list: 0, get: 0, metadata: 0, admit: 0, listInstalled: 0, imports: 0 };
    const store = new CollectionStore(new MemoryCollectionStorage());
    const observed = new Proxy(store, {
        get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value !== "function") {
                return value;
            }
            return (...args: unknown[]) => {
                if (key === "admitRelease") {
                    counts.admit++;
                }
                if (key === "listInstalled") {
                    counts.listInstalled++;
                }
                if (key === "importAdmittedRelease") {
                    counts.imports++;
                }
                return value.apply(target, args);
            };
        },
    });
    let failure = false;
    const source: CollectionRepositorySource = {
        id: "official",
        async list() {
            counts.list++;
            return structuredClone(entries);
        },
        async getMetadata() {
            counts.metadata++;
            if (failure) {
                throw new Error("Repository unavailable");
            }
            return artifact.release;
        },
        async get() {
            counts.get++;
            if (failure) {
                throw new Error("Repository unavailable");
            }
            return { release: artifact.release, assets: [] };
        },
    };
    return {
        store,
        counts,
        artifact,
        source,
        sources: new CollectionSources(observed, [source]),
        setEntries(next: CollectionRepositoryEntry[]) {
            entries = next;
        },
        entry: entries[0]!,
        fail(next: boolean) {
            failure = next;
        },
    };
}

test("concurrent listings share verified metadata without fetching assets or admitting bundles", async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => f.sources.catalogue("site")));
    expect(results.every((r) => r.releases[0]?.digest === f.artifact.digest)).toBe(true);
    expect(f.counts).toEqual({ list: 8, listInstalled: 8, get: 0, metadata: 1, admit: 0, imports: 0 });
    await f.sources.catalogue("site");
    expect(f.counts.metadata).toBe(1);
    expect(f.counts.get).toBe(0);
    expect(f.counts.admit).toBe(0);
});

test("warm listings keep installations site-scoped and revisions fresh", async () => {
    const f = await fixture();
    await f.store.importAdmittedRelease(f.artifact);
    await f.store.install("site-a", f.artifact.digest, 0, "official");
    const a = await f.sources.catalogue("site-a");
    const b = await f.sources.catalogue("site-b");
    expect(a.releases[0]?.action).toBe("current");
    expect(b.releases[0]?.action).toBe("install");
    expect(b.installed).toEqual([]);
    await f.store.uninstall("site-a", "example", 1);
    const changed = await f.sources.catalogue("site-a");
    expect(changed.revision).toBe(2);
    expect(changed.releases[0]?.action).toBe("install");
    expect(f.counts.metadata).toBe(1);
    expect(f.counts.get).toBe(0);
});

test("warm admission does not hide a release removed from the current catalogue", async () => {
    const f = await fixture();
    await f.sources.catalogue("site");
    f.setEntries([]);
    expect((await f.sources.catalogue("site")).releases).toEqual([]);
    expect(f.counts.list).toBe(2);
    expect(f.counts.metadata).toBe(1);
    expect(f.counts.get).toBe(0);
});

test("failed downloads can be retried without a sticky cached rejection", async () => {
    const f = await fixture();
    f.fail(true);
    await expect(f.sources.catalogue("site")).rejects.toThrow("Repository unavailable");
    f.fail(false);
    expect((await f.sources.catalogue("site")).releases).toHaveLength(1);
    expect(f.counts.metadata).toBe(2);
    expect(f.counts.get).toBe(0);
});

test("changing an advertised digest requires verification instead of reusing the old admission", async () => {
    const f = await fixture();
    await f.sources.catalogue("site");
    f.setEntries([{ ...f.entry, digest: `sha256:${"f".repeat(64)}` }]);
    await expect(f.sources.catalogue("site")).rejects.toMatchObject({ code: "RELEASE_MISMATCH" });
    expect(f.counts.metadata).toBe(2);
    expect(f.counts.get).toBe(0);
});

test("oversized catalogues fail before downloading any bundle", async () => {
    const f = await fixture();
    f.setEntries(Array.from({ length: 1_025 }, (_, i) => ({ ...f.entry, version: `1.0.${i}` })));
    await expect(f.sources.catalogue("site")).rejects.toMatchObject({ code: "CATALOGUE_TOO_LARGE" });
    expect(f.counts.get).toBe(0);
    expect(f.counts.admit).toBe(0);
});

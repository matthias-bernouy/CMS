import { expect, test } from "bun:test";
import { exampleCollection } from "../fixture";
import { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import { MemoryCollectionStorage } from "repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
import { installedExampleCaptureDocument } from "repository/collections/tooling/examples/capture";
test("one example loads only its selected dependency graph and preserves the installed release identity", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(exampleCollection());
    await store.install("default", artifact.digest, 0);
    const unused = await store.importRelease({
        ...exampleCollection(),
        collectionId: "proof/unused",
        publisherId: "proof",
        blocs: [],
        examples: [],
    });
    await store.install("default", unused.digest, 1);
    let reads = 0;
    let revisions = 0;
    const original = store.readInstalled.bind(store);
    const revision = store.revision.bind(store);
    store.readInstalled = async (siteId, collectionId) => {
        reads++;
        expect(collectionId).toBe("atlas.official/atlas");
        return original(siteId, collectionId);
    };
    store.revision = async (siteId) => {
        revisions++;
        return revision(siteId);
    };
    store.snapshot = async () => {
        throw new Error("Captures must not hydrate unrelated installed releases");
    };
    const result = await installedExampleCaptureDocument(store, "default", {
        collectionId: "atlas.official/atlas",
        exampleId: "assembled",
        previewId: "desktop",
        locale: "en-US",
        themeMode: "light",
    });
    expect(result.source).toMatchObject({
        kind: "installed-example",
        revision: "2",
        releaseDigest: artifact.digest,
        dependencies: [],
    });
    expect(reads).toBe(1);
    expect(revisions).toBe(2);
    await expect(
        installedExampleCaptureDocument(store, "other-instance", {
            collectionId: "atlas.official/atlas",
            exampleId: "assembled",
            previewId: "desktop",
            locale: "en-US",
            themeMode: "light",
        }),
    ).rejects.toThrow("NOT_FOUND");
});

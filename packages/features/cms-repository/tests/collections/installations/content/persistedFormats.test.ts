import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { collectionDocument } from "../../fixtures";

test("Mongo collection reads require an explicit publication state without rewriting records", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const admitted = await admitCollectionRelease(collectionDocument());
    const releases = db.collection<Record<string, unknown>>("collection_releases");
    for (const state of [undefined, "published"]) {
        const document = { _id: admitted.digest, digest: admitted.digest, release: admitted.release, state };
        await releases.replaceOne({ _id: admitted.digest }, document, { upsert: true });
        await expect(storage.getReleaseMetadata(admitted.digest)).rejects.toThrow("identity is inconsistent");
        await expect(storage.getAssetManifest(admitted.digest)).rejects.toThrow("identity is inconsistent");
        await expect(storage.putRelease({ ...admitted, assets: [] })).rejects.toThrow("identity is inconsistent");
        expect(await releases.findOne({ _id: admitted.digest })).toEqual(document);
    }
});

test("Mongo pending release recovery never reconstructs a missing or mismatched digest", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const admitted = await admitCollectionRelease(collectionDocument());
    const releases = db.collection<Record<string, unknown>>("collection_releases");
    for (const digest of [undefined, `sha256:${"0".repeat(64)}`]) {
        const document = { _id: admitted.digest, digest, release: admitted.release, state: "pending" };
        await releases.replaceOne({ _id: admitted.digest }, document, { upsert: true });
        await expect(storage.init()).rejects.toThrow("identity is inconsistent");
        await expect(storage.putRelease({ ...admitted, assets: [] })).rejects.toThrow("identity is inconsistent");
        expect(await releases.findOne({ _id: admitted.digest })).toEqual(document);
    }
});

import { expect, test } from "bun:test";
import { Binary } from "mongodb";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
import { fakeCatalogueDb } from "../../support/fakeCatalogueDb";
import { collectionDocument } from "../fixtures";

async function artifact() {
    const bytes = new Uint8Array([1, 2, 3]);
    const source = {
        ...collectionDocument(),
        assets: [
            {
                id: "payload.bin",
                mediaType: "application/octet-stream",
                byteLength: bytes.byteLength,
                digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`,
            },
        ],
    };
    return { admitted: await admitCollectionRelease(source, [{ id: "payload.bin", bytes }]), bytes };
}

test("Mongo collection storage reverifies release and asset bytes on every read", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const { admitted, bytes } = await artifact();
    await storage.putRelease({
        digest: admitted.digest,
        release: admitted.release,
        assets: [{ id: "payload.bin", bytes }],
    });
    expect(await storage.getReleaseMetadata(admitted.digest)).toEqual({
        digest: admitted.digest,
        release: admitted.release,
    });
    expect(await storage.getAsset(admitted.digest, "payload.bin")).toEqual(bytes);

    const assets = db.collection<Record<string, unknown>>("collection_assets");
    const storedAsset = await assets.findOne({ _id: `${admitted.digest}:payload.bin` });
    storedAsset!.bytes = new Binary(new Uint8Array([9, 9, 9]));
    await assets.replaceOne({ _id: storedAsset!._id }, storedAsset!);

    await expect(storage.getAsset(admitted.digest, "payload.bin")).rejects.toThrow("asset digest mismatch");
});

test("Mongo collection storage rejects a release whose persisted identity was altered", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const { admitted, bytes } = await artifact();
    await storage.putRelease({
        digest: admitted.digest,
        release: admitted.release,
        assets: [{ id: "payload.bin", bytes }],
    });

    const releases = db.collection<Record<string, unknown>>("collection_releases");
    const stored = await releases.findOne({ _id: admitted.digest });
    const persistedRelease = stored!.release as Record<string, unknown>;
    const translations = persistedRelease.translations as Record<string, Record<string, string>>;
    translations["en-US"]!["collection.name"] = "Tampered";
    await releases.replaceOne({ _id: stored!._id }, stored!);

    await expect(storage.getReleaseMetadata(admitted.digest)).rejects.toThrow("release digest mismatch");
    await expect(storage.getRelease(admitted.digest)).rejects.toThrow("release digest mismatch");
});

test("Mongo collection storage parses site records and snapshots validate installed values", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const store = new CollectionStore(storage);
    const source = {
        ...collectionDocument(),
        configuration: {
            schema: {
                type: "object",
                properties: { title: { type: "string", maxLength: 32 } },
                required: ["title"],
            },
            defaults: { title: "Welcome" },
        },
    };
    const admitted = await store.importRelease(source);
    await store.install("site", admitted.digest, 0, "local");

    const sites = db.collection<Record<string, unknown>>("collection_installations");
    const state = await sites.findOne({ _id: "site" });
    const installation = (state!.installations as Record<string, unknown>[])[0]!;
    installation.configuration = { title: 42 };
    await sites.replaceOne({ _id: state!._id }, state!);

    await expect(store.snapshot("site")).rejects.toThrow("Stored collection configuration is invalid");

    state!.installations = [installation, structuredClone(installation)];
    await sites.replaceOne({ _id: state!._id }, state!);
    await expect(storage.readSite("site")).rejects.toThrow("duplicate installations");
});

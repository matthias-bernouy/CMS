import { expect, test } from "bun:test";
import { Binary } from "mongodb";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
import { fakeCatalogueDb } from "../../support/fakeCatalogueDb";
import { collectionDocument } from "../fixtures";
import { COLLECTION_ASSET_CHUNK_BYTES } from "../../../src/collections/installations/default-implementation/mongo/assetChunks";
import { assertMongoBsonDocumentSize } from "../../../src/collections/installations/default-implementation/mongo/bsonSize";

async function artifact(bytes = new Uint8Array([1, 2, 3])) {
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

    const assets = db.collection<Record<string, unknown>>("collection_asset_chunks");
    const storedAsset = await assets.findOne({ _id: `${admitted.digest}:payload.bin:0` });
    storedAsset!.bytes = new Binary(new Uint8Array([9, 9, 9]));
    await assets.replaceOne({ _id: storedAsset!._id }, storedAsset!);

    await expect(storage.getAsset(admitted.digest, "payload.bin")).rejects.toThrow("chunk digest mismatch");
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

test("Mongo collection storage hides and resumes an interrupted release publication", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const { admitted, bytes } = await artifact();
    await db.collection("collection_releases").insertOne({
        _id: admitted.digest,
        digest: admitted.digest,
        release: admitted.release,
        state: "pending",
    });
    await db.collection("collection_asset_chunks").insertOne({
        _id: `${admitted.digest}:payload.bin:0`,
        digest: admitted.digest,
        id: "payload.bin",
        index: 0,
        byteLength: 1,
        chunkDigest: `sha256:${"0".repeat(64)}`,
        bytes: new Binary(new Uint8Array([9])),
    });

    expect(await storage.getReleaseMetadata(admitted.digest)).toBeNull();
    expect(await storage.getRelease(admitted.digest)).toBeNull();

    await storage.putRelease({
        digest: admitted.digest,
        release: admitted.release,
        assets: [{ id: "payload.bin", bytes }],
    });
    expect(await storage.getRelease(admitted.digest)).toMatchObject({ digest: admitted.digest });
    expect(await storage.getAsset(admitted.digest, "payload.bin")).toEqual(bytes);
});

test("Mongo collection storage promotes a complete pending release during initialization", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const { admitted, bytes } = await artifact();
    await storage.putRelease({
        digest: admitted.digest,
        release: admitted.release,
        assets: [{ id: "payload.bin", bytes }],
    });
    await db.collection("collection_releases").updateOne({ _id: admitted.digest }, { $set: { state: "pending" } });

    await storage.init();

    expect(await storage.getRelease(admitted.digest)).toMatchObject({ digest: admitted.digest });
});

test("Mongo collection storage removes incomplete pending releases and their chunks", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const { admitted } = await artifact(new Uint8Array([1, 2, 3, 4]));
    await db.collection("collection_releases").insertOne({
        _id: admitted.digest,
        digest: admitted.digest,
        release: admitted.release,
        state: "pending",
    });
    await db.collection("collection_asset_chunks").insertOne({
        _id: `${admitted.digest}:payload.bin:0`,
        digest: admitted.digest,
        id: "payload.bin",
        index: 0,
        byteLength: 1,
        chunkDigest: `sha256:${"0".repeat(64)}`,
        bytes: new Binary(new Uint8Array([9])),
    });

    await storage.init();

    expect(await db.collection("collection_releases").findOne({ _id: admitted.digest })).toBeNull();
    expect(await db.collection("collection_asset_chunks").findOne({ digest: admitted.digest })).toBeNull();
});

test("Mongo collection ranges load and verify only the chunks they cover", async () => {
    const db = fakeCatalogueDb();
    const storage = new MongoCollectionStorage(db);
    const bytes = Uint8Array.from({ length: COLLECTION_ASSET_CHUNK_BYTES + 32 }, (_, index) => index % 251);
    const { admitted } = await artifact(bytes);
    await storage.putRelease({
        digest: admitted.digest,
        release: admitted.release,
        assets: [{ id: "payload.bin", bytes }],
    });

    const range = { start: 8, end: 31 };
    expect(await storage.getAsset(admitted.digest, "payload.bin", range)).toEqual(bytes.slice(8, 32));
    const crossing = { start: COLLECTION_ASSET_CHUNK_BYTES - 2, end: COLLECTION_ASSET_CHUNK_BYTES + 2 };
    expect(await storage.getAsset(admitted.digest, "payload.bin", crossing)).toEqual(
        bytes.slice(crossing.start, crossing.end + 1),
    );

    const chunks = db.collection<Record<string, unknown>>("collection_asset_chunks");
    const second = await chunks.findOne({ _id: `${admitted.digest}:payload.bin:1` });
    second!.bytes = new Binary(new Uint8Array(32).fill(9));
    await chunks.replaceOne({ _id: second!._id }, second!);

    expect(await storage.getAsset(admitted.digest, "payload.bin", range)).toEqual(bytes.slice(8, 32));
    await expect(storage.getAsset(admitted.digest, "payload.bin")).rejects.toThrow("chunk digest mismatch");
});

test("Mongo BSON writes are rejected by a deterministic preflight", () => {
    expect(() => assertMongoBsonDocumentSize({ _id: "safe", value: "ok" }, "Test document")).not.toThrow();
    expect(() =>
        assertMongoBsonDocumentSize({ _id: "large", value: "x".repeat(16 * 1024 * 1024) }, "Test document"),
    ).toThrow("16 MiB");
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

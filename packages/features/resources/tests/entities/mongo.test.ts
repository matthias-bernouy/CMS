import { expect, test } from "bun:test";
import { sha256Digest } from "@bernouy/binary-media";
import { MongoResourceMetadataStore } from "../../src/exports/mongo";
import { ResourceTexts } from "../../src/exports/storage";
import { mongoFixture } from "./mongoFixture";

const source = {
    namespace: "acme/base",
    locale: "en",
    texts: [{ id: "welcome", category: "General", group: "Base", label: "Welcome", values: { en: "Hello" } }],
};

test("Mongo resource metadata is scoped and batches repeated asset references in one bounded query", async () => {
    const fixture = mongoFixture();
    const a = new MongoResourceMetadataStore(fixture.db, "instance-a:default");
    const b = new MongoResourceMetadataStore(fixture.db, "instance-b:default");
    await a.init();
    expect(fixture.indexes).toEqual([{ scopeId: 1, kind: 1, _id: 1 }]);
    const asset = {
        namespace: "acme/base",
        id: "file.txt",
        mediaType: "text/plain",
        byteLength: 1,
        digest: await sha256Digest(new Uint8Array([65])),
    };
    expect(await a.isEmpty()).toBe(true);
    await a.createAsset(asset);
    expect(await b.isEmpty()).toBe(true);
    await b.createAsset({ ...asset, digest: await sha256Digest(new Uint8Array([66])) });
    const ref = { namespace: asset.namespace, id: asset.id };
    expect(await a.readAssets([ref, ref, ref])).toEqual([asset]);
    expect(fixture.reads).toHaveLength(1);
    expect(fixture.reads[0]).toMatchObject({
        filter: { scopeId: "instance-a:default", kind: "asset" },
        limit: 1,
        loaded: 1,
    });
    expect(await a.readAssets([])).toEqual([]);
    expect(fixture.reads).toHaveLength(1);
    await a.createAsset(asset);
    await expect(a.createAsset({ ...asset, mediaType: "application/octet-stream" })).rejects.toThrow("already exists");
    expect(await a.readAssets([ref])).toEqual([asset]);
});

test("Mongo text snapshots use bounded scope reads and atomic revision comparisons", async () => {
    const fixture = mongoFixture();
    const a = new ResourceTexts(new MongoResourceMetadataStore(fixture.db, "instance-a:default"));
    const b = new ResourceTexts(new MongoResourceMetadataStore(fixture.db, "instance-b:default"));
    await a.createExact(source);
    expect((await b.snapshot()).sources).toEqual([]);
    const before = (await a.snapshot()).sources[0]!;
    const attempts = await Promise.allSettled([
        a.save(source.namespace, "welcome", "en", "One", before.revision),
        a.save(source.namespace, "welcome", "en", "Two", before.revision),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
        fixture.writes
            .filter((write) => write.kind === "replace")
            .every(
                (write) =>
                    write.filter?.scopeId === "instance-a:default" &&
                    write.filter?.["record.revision"] === before.revision,
            ),
    ).toBe(true);
    expect(fixture.reads.every((read) => read.limit === 33 && read.loaded <= 32)).toBe(true);
    expect((await a.snapshot()).sources[0]?.revision).not.toBe(before.revision);
});

test("missing persisted resource protocol fields fail without backfilling the record", async () => {
    const fixture = mongoFixture();
    const texts = new ResourceTexts(new MongoResourceMetadataStore(fixture.db, "instance-a:default"));
    await texts.createExact(source);
    const row = [...fixture.rows.values()][0]!;
    delete row.protocol;
    const writes = fixture.writes.length;
    await expect(texts.snapshot()).rejects.toThrow("protocol");
    expect(fixture.writes).toHaveLength(writes);
    expect(row).not.toHaveProperty("protocol");
});

test("text defaults exceeding the resource budget refuse before persistence", async () => {
    const fixture = mongoFixture();
    const metadata = new MongoResourceMetadataStore(fixture.db, "instance-a:default");
    const texts = new ResourceTexts(metadata);
    const value = "x".repeat(65536);
    await expect(
        texts.createExact({
            ...source,
            texts: Array.from({ length: 4 }, (_, index) => ({
                ...source.texts[0],
                id: `text-${index}`,
                values: { en: value },
            })),
        }),
    ).rejects.toThrow("limit");
    expect(await metadata.isEmpty()).toBe(true);
    expect(fixture.writes).toEqual([]);
});

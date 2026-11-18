import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { createMongoContentRepository } from "../contentMongoFixture";
import { referenceFixture } from "./fixture";

test("populated unmarked Bloc storage refuses initialization and deletion without repairing records", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.createBloc({
        id: "code-consumer",
        name: "Consumer",
        group: "Code",
        description: "",
        viewJS: "",
        root: { accepts: ["div"] },
    });
    const before = await db.get("blocs").find({}).toArray();
    await expect(repository.init()).rejects.toThrow("explicit Bloc reference projection upgrade");
    await expect(repository.deleteSiteBloc("site-target", 1, "unknown")).rejects.toThrow("projection format v1");
    expect(await db.get("blocs").find({}).toArray()).toEqual(before);
    expect(await db.get("content_metadata").findOne({ _id: "bloc-references" })).toBeNull();
});

test("missing and malformed persisted reference projections fail without backfills", async () => {
    for (const value of [undefined, [1], "site-target"]) {
        const { db, raw } = await referenceFixture();
        const blocs = db.get("blocs");
        if (value === undefined) {
            await blocs.updateOne({ _id: "site-target" }, { $set: {}, $unset: { contentReferences: "" } });
        } else {
            await blocs.updateOne({ _id: "site-target" }, { $set: { contentReferences: value } });
        }
        const before = await blocs.findOne({ _id: "site-target" });
        await expect(raw.getBlocRecord("site-target")).rejects.toThrow("requires contentReferences");
        expect(await blocs.findOne({ _id: "site-target" })).toEqual(before);
    }
});

test("fresh projection metadata is scoped and malformed readiness never repairs itself", async () => {
    const { db, repository } = createMongoContentRepository("tenant_");
    await repository.init();
    await db.get("tenant_content_metadata").updateOne({ _id: "bloc-references" }, { $set: { version: 0 } });
    const other = new MongoContentRepository(db as unknown as Db, { collectionPrefix: "other_" });
    await other.init();
    expect(await db.get("other_content_metadata").findOne({ _id: "bloc-references" })).toMatchObject({ version: 1 });
    const before = await db.get("tenant_content_metadata").find({}).toArray();
    const reopened = new MongoContentRepository(db as unknown as Db, { collectionPrefix: "tenant_" });
    await expect(reopened.init()).rejects.toThrow("projection format v1");
    expect(await db.get("tenant_content_metadata").find({}).toArray()).toEqual(before);
});

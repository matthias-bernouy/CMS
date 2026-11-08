import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { createMongoContentRepository } from "../contentMongoFixture";

for (const field of ["revision", "contentReferences"]) {
    test(`Mongo refuses a Page missing ${field} without repairing persisted data`, async () => {
        const { repository, db } = createMongoContentRepository();
        await repository.init();
        await repository.insertPage("/source", "Source");
        const page = (await repository.getPage("/source"))!;
        await db.get("pages").updateOne({ _id: page.id }, { $set: {}, $unset: { [field]: "" } });
        const before = await db.get("pages").find({}).toArray();
        await expect(repository.init()).rejects.toThrow(`requires ${field}`);
        await expect(repository.getPageById(page.id)).rejects.toThrow("valid revision and contentReferences");
        expect(await db.get("pages").find({}).toArray()).toEqual(before);
    });
}

for (const field of [
    "settingsRevision",
    "activePageWrites",
    "activePageWritePermits",
    "site.organization",
    "site.additionalLanguages",
]) {
    test(`Mongo refuses a system missing ${field} without compatibility defaults`, async () => {
        const { repository, db } = createMongoContentRepository();
        await repository.init();
        await db.get("system").updateOne({ _id: "singleton" }, { $set: {}, $unset: { [field]: "" } });
        const before = await db.get("system").find({}).toArray();
        await expect(repository.getSystem()).rejects.toThrow("requires");
        await expect(repository.updateSystem({ site: { name: "Must not change" } as never })).rejects.toThrow(
            "requires",
        );
        expect(await db.get("system").find({}).toArray()).toEqual(before);
        const neighbour = new MongoContentRepository(db as unknown as Db, { collectionPrefix: "neighbour_" });
        expect((await neighbour.getSystem()).site.name).toBe("");
    });
}

test.each(["editor", "site.theme"])("Mongo rejects removed settings field %s without dropping it", async (field) => {
    const { repository, db } = createMongoContentRepository();
    await repository.init();
    await db.get("system").updateOne({ _id: "singleton" }, { $set: { [field]: {} } });
    const before = await db.get("system").find({}).toArray();
    await expect(repository.getSystem()).rejects.toThrow("unsupported field");
    expect(await db.get("system").find({}).toArray()).toEqual(before);
});

import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoSiteUpgradeStorage } from "repository/site-upgrades/mongo";
import { FakeContentDb } from "../../../../../../content/tests/application/mongo/contentMongoFixture";

test("parallel metadata reads remain bracketed by ordered revision reads and both must settle", async () => {
    const db = new FakeContentDb();
    const storage = new MongoSiteUpgradeStorage(db as unknown as Db);
    await storage.withWrite("site", async () => undefined);
    const expected = await storage.readResourceRevision("site");
    const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const finish = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    let clockReads = 0;
    db.get("site_resource_revisions").afterFindOne = async () => {
        clockReads++;
    };
    for (const [index, name] of ["site_upgrade_maintenance", "site_write_permits"].entries()) {
        db.get(name).afterFindOne = async () => {
            expect(clockReads).toBe(1);
            entered[index]!.resolve();
            await finish[index]!.promise;
        };
    }
    const reading = storage.readResourceRevision("site");
    await Promise.all(entered.map((item) => item.promise));
    expect(clockReads).toBe(1);
    finish[0]!.resolve();
    await Promise.resolve();
    expect(clockReads).toBe(1);
    finish[1]!.resolve();
    expect(await reading).toBe(expected);
    expect(clockReads).toBe(2);
});

test("a write completing while metadata is read cannot validate either adjacent generation", async () => {
    const db = new FakeContentDb();
    const storage = new MongoSiteUpgradeStorage(db as unknown as Db);
    await storage.withWrite("site", async () => undefined);
    const before = await storage.readResourceRevision("site");
    let crossed = false;
    db.get("site_write_permits").afterFindOne = async () => {
        if (!crossed) {
            crossed = true;
            await storage.withWrite("site", async () => undefined);
        }
    };
    const overlapping = await storage.readResourceRevision("site");
    const current = await storage.readResourceRevision("site");
    expect(current).not.toBe(before);
    expect(overlapping).not.toBe(before);
    expect(overlapping).not.toBe(current);
});

test("failure of either independent metadata read refuses without repairing state", async () => {
    for (const name of ["site_upgrade_maintenance", "site_write_permits"]) {
        const db = new FakeContentDb();
        const storage = new MongoSiteUpgradeStorage(db as unknown as Db);
        await storage.withWrite("site", async () => undefined);
        const before = await db.get("site_resource_revisions").findOne({ _id: "site" });
        db.get(name).afterFindOne = async () => {
            throw new Error("metadata unavailable");
        };
        await expect(storage.readResourceRevision("site")).rejects.toThrow("metadata unavailable");
        expect(await db.get("site_resource_revisions").findOne({ _id: "site" })).toEqual(before);
    }
});

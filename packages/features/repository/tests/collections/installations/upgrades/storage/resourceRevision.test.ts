import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoSiteUpgradeStorage } from "repository/site-upgrades/mongo";
import { FakeContentDb } from "../../../../../../content/tests/application/mongo/contentMongoFixture";

function fixture() {
    const db = new FakeContentDb();
    const storage = new MongoSiteUpgradeStorage(db as unknown as Db);
    return { db, storage, read: () => storage.readResourceRevision("site") };
}

test("missing cache metadata stays uncacheable without implicit repair; quiet reads are bounded and site scoped", async () => {
    const f = fixture();
    expect(await f.read()).not.toBe(await f.read());
    expect(await f.db.get("site_resource_revisions").findOne({ _id: "site" })).toBeNull();
    await f.storage.withWrite("site", async () => undefined);
    const revision = await f.read();
    const calls: Array<{ collection: string; filter: object }> = [];
    for (const name of ["site_resource_revisions", "site_upgrade_maintenance", "site_write_permits"]) {
        f.db.get(name).afterFindOne = async (filter) => {
            calls.push({ collection: name, filter });
        };
    }
    expect(await f.read()).toBe(revision);
    expect(calls).toEqual([
        { collection: "site_resource_revisions", filter: { _id: "site" } },
        { collection: "site_upgrade_maintenance", filter: { _id: "site" } },
        { collection: "site_write_permits", filter: { siteId: "site", affectsResources: { $ne: false } } },
        { collection: "site_resource_revisions", filter: { _id: "site" } },
    ]);
    await f.storage.withWrite("other-site", async () => undefined);
    expect(await f.read()).toBe(revision);
});

test("concurrent writers prevent cache reuse until every permit settles, including refusals", async () => {
    const f = fixture();
    await f.storage.withWrite("site", async () => undefined);
    const before = await f.read();
    const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const finish = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const writes = entered.map((entry, index) =>
        f.storage.withWrite("site", async () => {
            entry.resolve();
            await finish[index]!.promise;
        }),
    );
    await Promise.all(entered.map((entry) => entry.promise));
    expect(await f.read()).not.toBe(await f.read());
    finish[0]!.resolve();
    await writes[0];
    expect(await f.read()).not.toBe(await f.read());
    finish[1]!.resolve();
    await writes[1];
    const settled = await f.read();
    expect(settled).not.toBe(before);
    expect(await f.read()).toBe(settled);
    await expect(
        f.storage.withWrite("site", async () => {
            throw new Error("refused");
        }),
    ).rejects.toThrow("refused");
    expect(await f.read()).not.toBe(settled);
    expect(await f.db.get("site_write_permits").findOne({ siteId: "site" })).toBeNull();
});

test("draft-only writes remain fenced by maintenance without invalidating public resource revisions", async () => {
    const f = fixture();
    await f.storage.withWrite("site", async () => undefined);
    const before = await f.read();
    await f.storage.withWrite(
        "site",
        async () => {
            expect(await f.read()).toBe(before);
            expect(await f.db.get("site_write_permits").findOne({ siteId: "site" })).toMatchObject({
                affectsResources: false,
            });
        },
        { invalidateResources: false },
    );
    expect(await f.read()).toBe(before);
    expect(await f.storage.claimMaintenance("site", "upgrade")).toBe(true);
    try {
        await expect(
            f.storage.withWrite("site", async () => undefined, { invalidateResources: false }),
        ).rejects.toMatchObject({ status: 423 });
    } finally {
        await f.storage.releaseMaintenance("site", "upgrade");
    }
});

test("a writer completing between revision reads cannot validate the previous cache generation", async () => {
    const f = fixture();
    await f.storage.withWrite("site", async () => undefined);
    const previous = await f.read();
    let crossed = false;
    f.db.get("site_resource_revisions").afterFindOne = async () => {
        if (!crossed) {
            crossed = true;
            await f.storage.withWrite("site", async () => undefined);
        }
    };
    const racing = await f.read();
    const current = await f.read();
    expect(current).not.toBe(previous);
    expect(racing).not.toBe(previous);
    expect(racing).not.toBe(current);
});

test("failed revision persistence retains the durable permit, even beyond its lease expiry", async () => {
    const f = fixture();
    await f.storage.withWrite("site", async () => undefined);
    f.db.get("site_resource_revisions").replaceOne = async () => {
        throw new Error("revision storage unavailable");
    };
    await expect(f.storage.withWrite("site", async () => "business write completed")).rejects.toThrow(
        "revision storage",
    );
    const permit = await f.db.get("site_write_permits").findOne({ siteId: "site" });
    expect(permit).not.toBeNull();
    await f.db.get("site_write_permits").updateOne({ _id: permit!._id }, { $set: { expiresAt: new Date(0) } });
    expect(await f.read()).not.toBe(await f.read());
});

test("maintenance prevents reuse and release advances the revision; invalid persisted clocks fail closed", async () => {
    const f = fixture();
    await f.storage.withWrite("site", async () => undefined);
    const before = await f.read();
    expect(await f.storage.claimMaintenance("site", "upgrade")).toBeTrue();
    try {
        expect(await f.read()).not.toBe(await f.read());
    } finally {
        await f.storage.releaseMaintenance("site", "upgrade");
    }
    const after = await f.read();
    expect(after).not.toBe(before);
    expect(await f.read()).toBe(after);
    await f.db.get("site_resource_revisions").replaceOne({ _id: "site" }, { _id: "site" });
    await expect(f.read()).rejects.toThrow("Invalid persisted resource revision");
});

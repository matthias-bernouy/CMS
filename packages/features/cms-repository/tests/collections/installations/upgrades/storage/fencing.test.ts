import { expect, test } from "bun:test";
import { MongoSiteUpgradeStorage } from "@bernouy/cms-repository/upgrades/mongo";
import type { Db } from "mongodb";
import { FakeContentDb } from "../../../../../../cms-content/tests/application/mongo/contentMongoFixture";

test("rejects a stale upgrade owner and cannot release its successor's lease", async () => {
    const db = new FakeContentDb();
    const storage = new MongoSiteUpgradeStorage(db as unknown as Db);
    await storage.init();
    expect(await storage.claimMaintenance("site", "migration-a")).toBe(true);

    const maintenance = db.get("site_upgrade_maintenance");
    await maintenance.replaceOne(
        { _id: "site" },
        {
            _id: "site",
            maintenance: {
                id: "migration-a",
                token: "successor-token",
                expiresAt: new Date(Date.now() + 60_000),
            },
        },
    );

    await expect(storage.assertMaintenance("site", "migration-a")).rejects.toMatchObject({ status: 409 });
    await storage.releaseMaintenance("site", "migration-a");
    expect(await maintenance.findOne({ _id: "site" })).toMatchObject({
        maintenance: { token: "successor-token" },
    });
});

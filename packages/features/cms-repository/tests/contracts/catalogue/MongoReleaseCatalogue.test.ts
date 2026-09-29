import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { fakeCatalogueDb } from "../../support/fakeCatalogueDb";
import { contractDocument } from "../support/fixtures";

test("Mongo release catalogue publishes immutable pins across adapter restarts", async () => {
    const db = fakeCatalogueDb();
    const first = new MongoReleaseCatalogue(db);
    const release = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const published = await first.publish(release);
    const recreated = new MongoReleaseCatalogue(db);
    expect((await recreated.get("communication.email", "1.0.0"))?.admission.digest).toBe(release.digest);
    expect((await recreated.findByDigest(release.digest))?.publishedAt).toBe(published.publishedAt);
    expect((await recreated.publish(release)).publishedAt).toBe(published.publishedAt);
    const yanked = await recreated.setYank("communication.email", "1.0.0", { reason: "withdrawn" });
    expect(yanked.yank?.reason).toBe("withdrawn");
    expect((await first.list())[0]?.yank?.reason).toBe("withdrawn");
    await expect(
        first.publish(await admitContractRelease(contractDocument({ version: "1.0.0", name: "Changed" }))),
    ).rejects.toThrow("already published");
});

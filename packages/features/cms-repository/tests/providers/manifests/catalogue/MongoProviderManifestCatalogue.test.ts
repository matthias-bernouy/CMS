import { expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { MongoProviderManifestCatalogue } from "@bernouy/cms-repository/providers/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { manifestCatalogueFixture } from "./fixtures";

test("Mongo manifest catalogue keeps exact claims and yanks across adapter restarts", async () => {
    const fixture = await manifestCatalogueFixture();
    const db = fakeCatalogueDb();
    const first = new MongoProviderManifestCatalogue(db, fixture.contracts);
    const published = await first.publish(fixture.admission);
    const recreated = new MongoProviderManifestCatalogue(db, fixture.contracts);
    expect((await recreated.get("ulvia.example", "1.0.0"))?.admission.digest).toBe(fixture.admission.digest);
    expect((await recreated.findByDigest(fixture.admission.digest))?.publishedAt).toBe(published.publishedAt);
    expect((await recreated.publish(fixture.admission)).publishedAt).toBe(published.publishedAt);
    const yanked = await recreated.setYank("ulvia.example", "1.0.0", { reason: "withdrawn" });
    expect(yanked.yank?.reason).toBe("withdrawn");
    expect((await first.list())[0]?.yank?.reason).toBe("withdrawn");
    const changed = await admitProviderManifest({ ...fixture.document, name: "Changed" }, fixture.contracts);
    await expect(first.publish(changed)).rejects.toThrow("already published");
});

import { expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { MongoProviderManifestCatalogue } from "@bernouy/cms-repository/providers/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { manifestCatalogueFixture } from "./fixtures";

test("Mongo manifest catalogue keeps exact claims and yanks across adapter restarts", async () => {
    const fixture = await manifestCatalogueFixture();
    const db = fakeCatalogueDb();
    const first = new MongoProviderManifestCatalogue(db, fixture.contracts);
    const beforeRevision = await first.revision();
    const published = await first.publish(fixture.admission);
    const publishedRevision = await first.revision();
    expect(publishedRevision).not.toBe(beforeRevision);
    const recreated = new MongoProviderManifestCatalogue(db, fixture.contracts);
    expect((await recreated.get("ulvia.example", "1.0.0"))?.admission.digest).toBe(fixture.admission.digest);
    expect((await recreated.findByDigest(fixture.admission.digest))?.publishedAt).toBe(published.publishedAt);
    expect((await recreated.publish(fixture.admission)).publishedAt).toBe(published.publishedAt);
    const yanked = await recreated.setYank("ulvia.example", "1.0.0", { reason: "withdrawn" });
    expect(await recreated.revision()).not.toBe(publishedRevision);
    expect(yanked.yank?.reason).toBe("withdrawn");
    expect((await first.list())[0]?.yank?.reason).toBe("withdrawn");
    const changed = await admitProviderManifest({ ...fixture.document, name: "Changed" }, fixture.contracts);
    await expect(first.publish(changed)).rejects.toThrow("already published");
});

test("Mongo manifest catalogue does not store a rejected publisher artifact", async () => {
    const fixture = await manifestCatalogueFixture();
    const db = fakeCatalogueDb();
    const catalogue = new MongoProviderManifestCatalogue(db, fixture.contracts);
    await catalogue.publish(fixture.admission);
    const other = await admitProviderManifest(
        {
            ...fixture.document,
            version: "1.0.1",
            provenance: { publisherId: "other.publisher", publishedAt: "2026-09-22T00:00:00Z" },
        },
        fixture.contracts,
    );
    await expect(catalogue.publish(other)).rejects.toThrow("publisher ownership");
    expect(await db.collection("cms_manifest_artifacts").find({}).toArray()).toHaveLength(1);
});

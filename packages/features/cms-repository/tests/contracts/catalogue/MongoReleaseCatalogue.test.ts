import { expect, spyOn, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { fakeCatalogueDb } from "../../support/fakeCatalogueDb";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

test("Mongo release catalogue publishes immutable pins across adapter restarts", async () => {
    const db = fakeCatalogueDb();
    const first = new MongoReleaseCatalogue(db);
    const release = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const beforeRevision = await first.revision();
    const published = await first.publish(release);
    const publishedRevision = await first.revision();
    expect(publishedRevision).not.toBe(beforeRevision);
    const recreated = new MongoReleaseCatalogue(db);
    expect((await recreated.get("communication.email", "1.0.0"))?.admission.digest).toBe(release.digest);
    expect((await recreated.findByDigest(release.digest))?.publishedAt).toBe(published.publishedAt);
    expect((await recreated.publish(release)).publishedAt).toBe(published.publishedAt);
    const yanked = await recreated.setYank("communication.email", "1.0.0", { reason: "withdrawn" });
    expect(await recreated.revision()).not.toBe(publishedRevision);
    expect(yanked.yank?.reason).toBe("withdrawn");
    expect((await first.list())[0]?.yank?.reason).toBe("withdrawn");
    await expect(
        first.publish(await admitContractRelease(contractDocument({ version: "1.0.0", name: "Changed" }))),
    ).rejects.toThrow("already published");
});

test("Mongo release catalogue does not store a rejected publisher artifact", async () => {
    const db = fakeCatalogueDb();
    const catalogue = new MongoReleaseCatalogue(db);
    await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
    await expect(
        catalogue.publish(
            await admitContractRelease(contractDocument({ version: "2.0.0", publisherId: "other.publisher" })),
        ),
    ).rejects.toThrow("publisher ownership");
    expect(await db.collection("cms_contract_artifacts").find({}).toArray()).toHaveLength(1);
});

test("Mongo release catalogue does not store an invalid evolution artifact", async () => {
    const db = fakeCatalogueDb();
    const catalogue = new MongoReleaseCatalogue(db);
    await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
    const changed = capabilityDocument({
        input: objectSchema({ recipient: stringSchema(100), templateId: stringSchema(64) }, [
            "recipient",
            "templateId",
        ]),
    });
    const incompatible = await admitContractRelease(contractDocument({ version: "1.1.0", capabilities: [changed] }));
    await expect(catalogue.publish(incompatible)).rejects.toThrow("major change declared with a minor version bump");
    expect(await db.collection("cms_contract_artifacts").find({}).toArray()).toHaveLength(1);
});

test("warm immutable admissions avoid artifact reads while observing external yanks, deprecation and head corruption", async () => {
    const db = fakeCatalogueDb();
    const reader = new MongoReleaseCatalogue(db);
    const writer = new MongoReleaseCatalogue(db);
    const admission = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    await writer.publish(admission);
    const artifacts = db.collection("cms_contract_artifacts");
    const spy = spyOn(artifacts, "findOne");
    const first = await reader.get("communication.email", "1.0.0");
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await reader.get("communication.email", "1.0.0"))?.admission).toBe(first?.admission);
    expect((await reader.findByDigest(admission.digest))?.admission).toBe(first?.admission);
    expect(spy).toHaveBeenCalledTimes(1);
    await writer.setYank("communication.email", "1.0.0", { reason: "withdrawn" });
    await writer.setDeprecation("communication.email", "1.0.0", { reason: "replace" });
    const reads = spy.mock.calls.length;
    expect(await reader.get("communication.email", "1.0.0")).toMatchObject({
        yank: { reason: "withdrawn" },
        deprecation: { reason: "replace" },
    });
    expect(spy).toHaveBeenCalledTimes(reads);
    await db
        .collection("cms_contract_heads")
        .updateOne({ _id: "communication.email" }, { $set: { publisherId: "forged" } });
    await expect(reader.get("communication.email", "1.0.0")).rejects.toThrow("disagrees");
    spy.mockRestore();
});

test("verified admissions are isolated between databases and never substitute for a missing artifact in another instance", async () => {
    const admission = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const first = new MongoReleaseCatalogue(fakeCatalogueDb());
    const otherDb = fakeCatalogueDb();
    const other = new MongoReleaseCatalogue(otherDb);
    await first.publish(admission);
    await other.publish(admission);
    await first.get("communication.email", "1.0.0");
    await otherDb.collection("cms_contract_artifacts").deleteMany({});
    await expect(other.get("communication.email", "1.0.0")).rejects.toThrow("missing");
    expect((await first.get("communication.email", "1.0.0"))?.admission.digest).toBe(admission.digest);
});

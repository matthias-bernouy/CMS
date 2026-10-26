import { expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { CollectionUpgradeService } from "../../../../src/collections/installations/upgrades/runtime/CollectionUpgradeService";
import { MemorySiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import { withSiteWriteFence } from "@bernouy/cms-repository/upgrades";
import { collectionDocument } from "../../fixtures";

async function fixture() {
    const raw = new InMemoryCmsRepository();
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const storage = new MemorySiteUpgradeStorage();
    const old = await collections.importRelease(collectionDocument());
    await collections.install("site", old.digest, 0);
    const next = await collections.importRelease({ ...collectionDocument(), version: "1.1.0" });
    const repo = withSiteWriteFence(raw, storage, "site", ["insertPage", "updatePage"]);
    const service = new CollectionUpgradeService(raw, collections, storage, {
        contributors: [],
        requiredConsumers: [],
        validateCapabilities: async () => [],
    });
    return { repo, raw, collections, storage, next, service, targets: [{ digest: next.digest }] };
}

test("applies an exact reviewed switch once without changing Page bytes or revisions", async () => {
    const f = await fixture();
    await f.repo.insertPage("/page", "Page", '<div cms-bloc="atlas-panel"></div>');
    const before = await f.repo.getAllPages();
    const plan = await f.service.plan("site", f.targets);
    const results = await Promise.all([
        f.service.apply("site", f.targets, plan.planDigest),
        f.service.apply("site", f.targets, plan.planDigest),
    ]);
    expect(results.every(({ status }) => status === "completed")).toBe(true);
    expect(await f.collections.revision("site")).toBe(2);
    expect(await f.repo.getAllPages()).toEqual(before);
    expect((await f.service.apply("site", f.targets, plan.planDigest)).status).toBe("completed");
});

test("a Page write after review invalidates the plan", async () => {
    const f = await fixture();
    const plan = await f.service.plan("site", f.targets);
    await f.repo.insertPage("/new", "New", '<div cms-bloc="atlas-panel"></div>');
    await expect(f.service.apply("site", f.targets, plan.planDigest)).rejects.toThrow("stale");
    expect(await f.collections.revision("site")).toBe(1);
});

test("unresolved commit failures retain the fence and resume with the same pins", async () => {
    const f = await fixture();
    const original = f.collections.commitUpgrade.bind(f.collections);
    f.collections.commitUpgrade = async () => {
        throw new Error("Mongo connection interrupted before commit");
    };
    const plan = await f.service.plan("site", f.targets);
    await expect(f.service.apply("site", f.targets, plan.planDigest)).rejects.toThrow("interrupted");
    const active = await f.storage.getActive("site");
    expect(active?.status).toBe("applying");
    await expect(f.repo.insertPage("/blocked", "Blocked", "")).rejects.toMatchObject({ status: 423 });
    f.collections.commitUpgrade = original;
    expect((await f.service.resume("site", active!.id)).status).toBe("completed");
    await expect(f.repo.insertPage("/allowed", "Allowed", "")).resolves.toBeUndefined();
});

test("a lost commit acknowledgement resolves from the exact resulting state", async () => {
    const f = await fixture();
    const original = f.collections.commitUpgrade.bind(f.collections);
    f.collections.commitUpgrade = async (...args) => {
        await original(...args);
        throw new Error("Acknowledgement lost");
    };
    const plan = await f.service.plan("site", f.targets);
    expect((await f.service.apply("site", f.targets, plan.planDigest)).status).toBe("completed");
    expect(await f.collections.revision("site")).toBe(2);
});

test("a forged public commit permit cannot bypass the compatibility plan", async () => {
    const f = await fixture();
    await expect(f.collections.commitUpgrade("site", [], 1, { purpose: "collection-upgrade" })).rejects.toThrow(
        "reviewed",
    );
});

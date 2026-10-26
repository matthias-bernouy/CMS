import { InMemoryContentRepository } from "@bernouy/cms-content";
import { CollectionUpgradeService } from "../../../../src/collections/installations/upgrades/runtime/CollectionUpgradeService";
import { MemorySiteUpgradeStorage } from "../../../../src/site-upgrades/memory";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
export async function reviewedUpgrade(
    store: CollectionStore,
    siteId: string,
    digest: string,
    expectedRevision: number,
    repositoryId: string,
) {
    if ((await store.revision(siteId)) !== expectedRevision) {
        throw new Error("Revision conflict");
    }
    const service = new CollectionUpgradeService(
        new InMemoryContentRepository(),
        store,
        new MemorySiteUpgradeStorage(),
        {
            contributors: [],
            requiredConsumers: [],
            validateCapabilities: async () => [],
        },
    );
    const targets = [{ digest, repositoryId }];
    const plan = await service.plan(siteId, targets);
    if (plan.status !== "applicable") {
        throw new Error(plan.issues.map(({ message }) => message).join("; "));
    }
    await service.apply(siteId, targets, plan.planDigest);
    return store.snapshot(siteId);
}

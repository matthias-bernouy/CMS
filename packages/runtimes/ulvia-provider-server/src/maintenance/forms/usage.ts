import type { CapabilityUse } from "@bernouy/repository/collections/installations";
import { siteUsageInventory, CollectionStore } from "@bernouy/repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/repository/collections/mongo";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { validateCapabilityUsage } from "@bernouy/repository/providers/selections";
import { workflowUsage } from "@bernouy/workflows/mongo";
import type { Db } from "mongodb";
import type { StoredContractSelections } from "@bernouy/ulvia-providers/selections";
import type { previewSelection } from "./preview";
import type { migrationStores } from "./stores";
export async function inspectConsumers(
    db: Db,
    stores: ReturnType<typeof migrationStores>,
    selected: StoredContractSelections,
    next: Awaited<ReturnType<typeof previewSelection>>,
    installationId: string,
) {
    const inventory = await siteUsageInventory(
        new MongoContentRepository(db),
        new CollectionStore(new MongoCollectionStorage(db), stores.releases),
        "default",
        [],
        [],
    );
    const workflows = await workflowUsage(db, 10000);
    if (!inventory.complete || !workflows.complete) {
        throw new Error("FORMS_MIGRATION_USAGE_INCOMPLETE");
    }
    const requirements = inventory.references.filter(
        (ref): ref is CapabilityUse => ref.type === "capability" && ref.scope === "runtime",
    );
    const issues = await validateCapabilityUsage(
        { complete: true, revision: inventory.digest, requirements, unknown: [] },
        next.plan.selections,
        selected.plan.selections,
        next.grants,
        next.plan.dependencies,
        next.releases,
    );
    if (issues.length) {
        throw new Error(`FORMS_MIGRATION_CONSUMER:${issues[0]!.location}:${issues[0]!.code}`);
    }
    if (
        workflows.targets.some(
            (target) =>
                target.contractId === "ulvia/cms.forms" &&
                target.version.startsWith("1.") &&
                target.installationId === installationId,
        )
    ) {
        throw new Error("FORMS_MIGRATION_WORKFLOW_IN_USE: retire old published call plans and finish their runs first");
    }
    return { usage: inventory.digest, workflows: workflows.revision };
}

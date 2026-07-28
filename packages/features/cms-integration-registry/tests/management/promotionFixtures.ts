import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReleaseAdmissionDecisionStore } from "@bernouy/cms-integration-registry";
import { FsIntegrationRegistryStablePromoter, readStablePromotionRecord } from "@bernouy/cms-integration-registry/fs";
import { registryFixture } from "../publication/fixtures";

export function stablePromoter(
    fixture: ReturnType<typeof registryFixture>,
    decisions: ReleaseAdmissionDecisionStore,
): FsIntegrationRegistryStablePromoter {
    return new FsIntegrationRegistryStablePromoter({
        root: fixture.root,
        snapshots: fixture.snapshots,
        decisions,
        mutations: fixture.mutations,
        createOperationId: () => "promotion-operation-1",
        createPromotionId: () => "promotion-1",
        now: () => "2026-07-26T12:00:00.000Z",
    });
}

export function promotionRecords(root: string): string {
    return join(promotionRoot(root), "records");
}

export function promotionJournals(root: string): string {
    return join(promotionRoot(root), "journals");
}

export async function persistedRecord(root: string) {
    const records = promotionRecords(root);
    const [filename] = readdirSync(records);
    return await readStablePromotionRecord(join(records, filename!));
}

function promotionRoot(root: string): string {
    return join(root, "demo", ".registry", "promotions");
}

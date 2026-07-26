import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../../core/catalog/reference";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../interfaces/recovery";
import type { FsIntegrationRegistryLayout } from "../../persistence/layout";
import { stablePromotionStoragePaths } from "../layout";
import { quarantineFailedStablePromotion } from "./failure";
import { stablePromotionJournalInventory } from "./inventory";
import { replayStablePromotion } from "./replay";

export async function recoverStablePromotions(
    input: Readonly<{
        layout: FsIntegrationRegistryLayout;
        snapshots: IntegrationRegistryCatalogSnapshotReference;
        packageLimits?: Partial<IntegrationPackageLimits>;
    }>,
): Promise<readonly IntegrationRegistryRecoveryDiagnostic[]> {
    const diagnostics: IntegrationRegistryRecoveryDiagnostic[] = [];
    const integrationRoots = uniqueIntegrationRoots(input.snapshots);
    for (const integrationRoot of integrationRoots) {
        const storage = stablePromotionStoragePaths(integrationRoot);
        for (const entry of await stablePromotionJournalInventory(storage)) {
            try {
                diagnostics.push(await replayStablePromotion({ ...input, entry }));
            } catch (error) {
                diagnostics.push(await quarantineFailedStablePromotion(entry, input.layout, integrationRoot, error));
            }
        }
    }
    return diagnostics;
}

function uniqueIntegrationRoots(snapshots: IntegrationRegistryCatalogSnapshotReference): readonly string[] {
    const roots = new Set<string>();
    const snapshot = snapshots.current();
    for (const summary of snapshot.summaries) {
        const first = summary.versions[0];
        const location = first ? snapshot.locateExactVersion(summary.kind, first) : null;
        if (location) {
            roots.add(location.integrationRoot);
        }
    }
    return [...roots].sort(compareText);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

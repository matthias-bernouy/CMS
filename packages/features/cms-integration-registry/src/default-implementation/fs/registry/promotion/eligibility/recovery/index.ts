import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../../../core/catalog/reference";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../../interfaces/recovery";
import type { ReleaseAdmissionDecisionStore } from "../../../../../../interfaces/reportStore";
import type { FsIntegrationRegistryLayout } from "../../../persistence/layout";
import { versionEligibilityStoragePaths } from "../layout";
import { quarantineFailedVersionEligibility } from "./failure";
import { versionEligibilityJournalInventory } from "./inventory";
import { replayVersionEligibility } from "./replay";

export async function recoverVersionEligibilityMutations(
    input: Readonly<{
        layout: FsIntegrationRegistryLayout;
        snapshots: IntegrationRegistryCatalogSnapshotReference;
        decisions: ReleaseAdmissionDecisionStore;
        packageLimits?: Partial<IntegrationPackageLimits>;
    }>,
): Promise<readonly IntegrationRegistryRecoveryDiagnostic[]> {
    const diagnostics: IntegrationRegistryRecoveryDiagnostic[] = [];
    for (const integrationRoot of uniqueIntegrationRoots(input.snapshots)) {
        const storage = versionEligibilityStoragePaths(integrationRoot);
        for (const entry of await versionEligibilityJournalInventory(storage)) {
            try {
                diagnostics.push(await replayVersionEligibility({ ...input, entry }));
            } catch (error) {
                diagnostics.push(await quarantineFailedVersionEligibility(entry, input.layout, integrationRoot, error));
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
    return [...roots].sort((left, right) => left.localeCompare(right));
}

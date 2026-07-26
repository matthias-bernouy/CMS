import { ensureFsIntegrationRegistryCandidateLayout } from "../layout";
import { FsIntegrationRegistryCandidateStore } from "../store";
import { recoverCandidateInventory, recoverCandidateMutationLock, recoverObjectInventory } from "./inventory";
import { recoverInterruptedCandidatePruning } from "./retention";
import type {
    FsIntegrationRegistryCandidateRecoveryDiagnostic,
    FsIntegrationRegistryCandidateRecoveryResult,
    RecoverFsIntegrationRegistryCandidatesConfig,
} from "./types";

export {
    garbageCollectFsIntegrationRegistryCandidateObjects,
    type FsIntegrationRegistryCandidateGarbageCollectionResult,
    type GarbageCollectFsIntegrationRegistryCandidateObjectsConfig,
} from "./gc";
export {
    PRUNED_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
    PRUNED_INTEGRATION_REGISTRY_CANDIDATE_SCHEMA,
    readPrunedCandidate,
    type PrunedIntegrationRegistryCandidateRecord,
} from "./retention";

const DEFAULT_TEMPORARY_GRACE_MS = 60_000;

export async function recoverFsIntegrationRegistryCandidates(
    config: RecoverFsIntegrationRegistryCandidatesConfig,
): Promise<FsIntegrationRegistryCandidateRecoveryResult> {
    const now = canonicalTimestamp(config.now);
    const grace = config.temporaryGraceMs ?? DEFAULT_TEMPORARY_GRACE_MS;
    if (!Number.isSafeInteger(grace) || grace < 0) {
        throw new TypeError("Candidate recovery temporary grace must be a non-negative safe integer");
    }
    const layout = await ensureFsIntegrationRegistryCandidateLayout(config.root);
    const diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[] = [];
    await recoverCandidateMutationLock(layout, now, grace, diagnostics);
    await recoverInterruptedCandidatePruning(layout);
    await recoverObjectInventory(layout, layout.packages, "package", now, grace, diagnostics);
    await recoverObjectInventory(layout, layout.verifications, "verification", now, grace, diagnostics);
    await recoverObjectInventory(layout, layout.compatibilityReports, "compatibility-report", now, grace, diagnostics);
    await recoverObjectInventory(layout, layout.statefulSelections, "stateful-selection", now, grace, diagnostics);
    await recoverObjectInventory(layout, layout.policies, "policy", now, grace, diagnostics);
    await recoverObjectInventory(layout, layout.admissions, "admission", now, grace, diagnostics);
    await recoverObjectInventory(layout, layout.results, "result", now, grace, diagnostics);
    const store = new FsIntegrationRegistryCandidateStore({ root: layout.registry.root });
    await recoverCandidateInventory(layout, store, now, grace, diagnostics);
    return Object.freeze({
        diagnostics: Object.freeze(diagnostics),
        recoveredLeases: diagnostics.filter((entry) => entry.code === "lease_recovered").length,
        expiredCandidates: diagnostics.filter((entry) => entry.code === "expired").length,
        quarantinedEntries: diagnostics.filter((entry) => entry.code.startsWith("quarantined_")).length,
    });
}

export type {
    FsIntegrationRegistryCandidateRecoveryDiagnostic,
    FsIntegrationRegistryCandidateRecoveryResult,
    RecoverFsIntegrationRegistryCandidatesConfig,
} from "./types";

function canonicalTimestamp(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate recovery time must be a canonical ISO timestamp");
    }
    return value;
}

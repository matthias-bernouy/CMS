import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../../core/catalog/reference";
import type { IntegrationRegistryMutationCoordinator } from "../../../../../interfaces/mutations";
import type { ReleaseAdmissionDecisionStore } from "../../../../../interfaces/reportStore";
import type { FsIntegrationRegistryVersionEligibilityPhase } from "./journal";

export type FsIntegrationRegistryVersionEligibilityBoundary = Readonly<{
    operationId: string;
    recordId: string;
    phase: FsIntegrationRegistryVersionEligibilityPhase;
    action: "block" | "mark-inadmissible";
    kind: string;
    version: string;
    decisionRevisionId: string;
    decisionDigest: string;
}>;

export type FsIntegrationRegistryVersionEligibilityManagerConfig = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotReference;
    decisions: ReleaseAdmissionDecisionStore;
    mutations: IntegrationRegistryMutationCoordinator;
    packageLimits?: Partial<IntegrationPackageLimits>;
    createOperationId?: () => string;
    createRecordId?: () => string;
    now?: () => string;
    afterBoundary?: (boundary: FsIntegrationRegistryVersionEligibilityBoundary) => void | Promise<void>;
}>;

export class FsIntegrationRegistryVersionEligibilitySimulatedCrashError extends Error {
    constructor(
        readonly boundary: FsIntegrationRegistryVersionEligibilityBoundary,
        cause: unknown,
    ) {
        super(`Simulated integration registry crash after version eligibility ${boundary.phase}`, { cause });
        this.name = "FsIntegrationRegistryVersionEligibilitySimulatedCrashError";
    }
}

export class FsIntegrationRegistryVersionEligibilityRecoveryRequiredError extends Error {
    constructor(
        readonly boundary: FsIntegrationRegistryVersionEligibilityBoundary,
        cause: unknown,
    ) {
        super(`Integration registry version eligibility committed but requires recovery after ${boundary.phase}`, {
            cause,
        });
        this.name = "FsIntegrationRegistryVersionEligibilityRecoveryRequiredError";
    }
}

import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../core/catalog/reference";
import type { IntegrationRegistryMutationCoordinator } from "../../../../interfaces/mutations";
import type { ReleaseAdmissionDecisionStore } from "../../../../interfaces/reportStore";
import type { FsIntegrationRegistryStablePromotionPhase } from "./journal";

export type FsIntegrationRegistryStablePromotionBoundary = Readonly<{
    operationId: string;
    promotionId: string;
    phase: FsIntegrationRegistryStablePromotionPhase;
    kind: string;
    version: string;
    reportRevisionId: string;
    reportDigest: string;
}>;

type FsIntegrationRegistryStablePromoterConfigBase = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotReference;
    mutations: IntegrationRegistryMutationCoordinator;
    packageLimits?: Partial<IntegrationPackageLimits>;
    createOperationId?: () => string;
    createPromotionId?: () => string;
    now?: () => string;
    afterBoundary?: (boundary: FsIntegrationRegistryStablePromotionBoundary) => void | Promise<void>;
}>;

export type FsIntegrationRegistryStablePromoterConfig = FsIntegrationRegistryStablePromoterConfigBase &
    Readonly<{ decisions: ReleaseAdmissionDecisionStore }>;

export class FsIntegrationRegistryStablePromotionSimulatedCrashError extends Error {
    constructor(
        readonly boundary: FsIntegrationRegistryStablePromotionBoundary,
        cause: unknown,
    ) {
        super(`Simulated integration registry crash after stable promotion ${boundary.phase}`, { cause });
        this.name = "FsIntegrationRegistryStablePromotionSimulatedCrashError";
    }
}

export class FsIntegrationRegistryStablePromotionRecoveryRequiredError extends Error {
    constructor(
        readonly boundary: FsIntegrationRegistryStablePromotionBoundary,
        cause: unknown,
    ) {
        super(`Integration registry stable promotion committed but requires recovery after ${boundary.phase}`, {
            cause,
        });
        this.name = "FsIntegrationRegistryStablePromotionRecoveryRequiredError";
    }
}

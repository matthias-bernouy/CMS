import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../../core/catalog/reference";
import type { IntegrationRegistryMutationCoordinator } from "../../../../../interfaces/mutations";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationVerificationBundleStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
    ReviewedSchemaBaselineStore,
} from "../../../../../interfaces/reportStore";
import type { FsIntegrationVerificationBackfillPhase } from "./document";

export type FsIntegrationVerificationBackfillBoundary = Readonly<{
    operationId: string;
    phase: FsIntegrationVerificationBackfillPhase;
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
}>;

export type FsIntegrationVerificationBackfillerConfig = Readonly<{
    root: string;
    approvedRequestDigests: readonly string[];
    snapshots: IntegrationRegistryCatalogSnapshotReference;
    mutations: IntegrationRegistryMutationCoordinator;
    bundles: IntegrationVerificationBundleStore;
    compatibilityReports: IntegrationCompatibilityV2ReportStore;
    verificationReports: IntegrationVerificationReportStore;
    decisions: ReleaseAdmissionDecisionStore;
    reviewedSchemaBaselines: ReviewedSchemaBaselineStore;
    packageLimits?: Partial<IntegrationPackageLimits>;
    createOperationId?: () => string;
    now?: () => string;
    afterBoundary?: (boundary: FsIntegrationVerificationBackfillBoundary) => void | Promise<void>;
}>;

export class FsIntegrationVerificationBackfillSimulatedCrashError extends Error {
    constructor(
        readonly boundary: FsIntegrationVerificationBackfillBoundary,
        cause: unknown,
    ) {
        super(`Simulated integration verification backfill crash after ${boundary.phase}`, { cause });
        this.name = "FsIntegrationVerificationBackfillSimulatedCrashError";
    }
}

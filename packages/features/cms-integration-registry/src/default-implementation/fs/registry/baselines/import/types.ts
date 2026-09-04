import type { IntegrationRegistryCatalogSnapshotProvider } from "../../../../../interfaces/catalog";
import type { IntegrationRegistryMutationCoordinator } from "../../../../../interfaces/mutations";
import type { ReviewedSchemaBaselineImportApproval } from "../../../../../interfaces/publication";
import type { ReviewedSchemaBaselineStore } from "../../../../../interfaces/reportStore";
import type { FsReviewedSchemaBaselineImportPhase } from "./document";

export type ReviewedSchemaBaselineImportTarget = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    connectorKey: string;
    lineageId: string;
}>;

export type FsReviewedSchemaBaselineImportBoundary = Readonly<{
    operationId: string;
    phase: FsReviewedSchemaBaselineImportPhase;
    kind: string;
    version: string;
    packageDigest: string;
    baselineDigest: string;
}>;

export type FsReviewedSchemaBaselineImporterConfig = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    store: ReviewedSchemaBaselineStore;
    mutations: IntegrationRegistryMutationCoordinator;
    approval: ReviewedSchemaBaselineImportApproval;
    approvedTargets: readonly ReviewedSchemaBaselineImportTarget[];
    createOperationId?: () => string;
    now?: () => string;
    afterBoundary?: (boundary: FsReviewedSchemaBaselineImportBoundary) => void | Promise<void>;
}>;

export class FsReviewedSchemaBaselineImportSimulatedCrashError extends Error {
    constructor(
        readonly boundary: FsReviewedSchemaBaselineImportBoundary,
        cause: unknown,
    ) {
        super(`Simulated reviewed schema baseline import crash after ${boundary.phase}`, { cause });
        this.name = "FsReviewedSchemaBaselineImportSimulatedCrashError";
    }
}

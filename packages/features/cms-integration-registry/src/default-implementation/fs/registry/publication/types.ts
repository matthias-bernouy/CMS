import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../core/catalog/reference";
import type { IntegrationCompatibilityEvaluator } from "../../../../core/compatibility/evaluation";
import type { FsIntegrationRegistryPublicationPhase } from "../persistence/journal";

export type FsIntegrationRegistryPublicationBoundary = Readonly<{
    operationId: string;
    phase: FsIntegrationRegistryPublicationPhase;
    kind: string;
    version: string;
    digest: string;
}>;

export type FsIntegrationRegistryPublisherConfig = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotReference;
    compatibility: IntegrationCompatibilityEvaluator;
    packageLimits?: Partial<IntegrationPackageLimits>;
    createOperationId?: () => string;
    now?: () => string;
    afterBoundary?: (boundary: FsIntegrationRegistryPublicationBoundary) => void | Promise<void>;
}>;

export class FsIntegrationRegistrySimulatedCrashError extends Error {
    constructor(
        readonly boundary: FsIntegrationRegistryPublicationBoundary,
        cause: unknown,
    ) {
        super(`Simulated integration registry crash after ${boundary.phase}`, { cause });
        this.name = "FsIntegrationRegistrySimulatedCrashError";
    }
}

export class FsIntegrationRegistryRecoveryRequiredError extends Error {
    constructor(
        readonly boundary: FsIntegrationRegistryPublicationBoundary,
        cause: unknown,
    ) {
        super(`Integration registry publication committed but requires recovery after ${boundary.phase}`, { cause });
        this.name = "FsIntegrationRegistryRecoveryRequiredError";
    }
}

import type { IntegrationPackageEnvelopeV1, IntegrationPackageLimits } from "../../../interfaces/envelope";

export type MaterializedIntegrationPackage = {
    readonly root: string;
    readonly digest: string;
    readonly envelope: IntegrationPackageEnvelopeV1;
};

export type IntegrationPackageCacheEvent = {
    type: "hit" | "miss" | "corruption" | "materialized";
    digest: string;
    kind?: string;
    version?: string;
    bytes?: number;
    durationMs: number;
};

export type FsIntegrationPackageCacheConfig = {
    root: string;
    limits?: Partial<IntegrationPackageLimits>;
    stagingSafetyAgeMs?: number;
    repairLockWaitMs?: number;
    repairLockStaleAgeMs?: number;
    now?: () => number;
    observe?: (event: IntegrationPackageCacheEvent) => void;
};

export type ExpectedIntegrationPackageIdentity = {
    kind?: string;
    version?: string;
    digest?: string;
};

export class IntegrationPackageCacheCorruptionError extends Error {
    readonly code = "integration_package_cache_corrupt";

    constructor(
        readonly digest: string,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "IntegrationPackageCacheCorruptionError";
    }
}

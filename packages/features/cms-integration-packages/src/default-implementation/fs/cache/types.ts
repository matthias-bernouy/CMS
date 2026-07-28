import type { IntegrationPackageEnvelopeV1, IntegrationPackageLimits } from "../../../interfaces/envelope";
export type { ExpectedIntegrationPackageIdentity } from "../writer/types";

export const INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA = "cms.integration.package.reference.v1" as const;

export type IntegrationPackageCacheReference = {
    readonly schema: typeof INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA;
    readonly kind: string;
    readonly version: string;
    readonly digest: string;
};

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

export class IntegrationPackageCacheReferenceCorruptionError extends Error {
    readonly code = "integration_package_cache_reference_corrupt";

    constructor(
        readonly kind: string,
        readonly version: string,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "IntegrationPackageCacheReferenceCorruptionError";
    }
}

export class IntegrationPackageCacheReferenceConflictError extends Error {
    readonly code = "integration_package_cache_reference_conflict";

    constructor(
        readonly kind: string,
        readonly version: string,
        readonly existingDigest: string,
        readonly requestedDigest: string,
    ) {
        super(
            `Integration package cache reference ${kind}@${version} already identifies digest ${existingDigest}, not ${requestedDigest}`,
        );
        this.name = "IntegrationPackageCacheReferenceConflictError";
    }
}

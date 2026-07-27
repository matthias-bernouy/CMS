import { isDisposablePostgresDatabase, isDisposablePostgresRole } from "../configuration";

export const POSTGRES_OWNERSHIP_SCHEMA = "cms_verifier_provider";
export const POSTGRES_OWNERSHIP_TABLE = `${POSTGRES_OWNERSHIP_SCHEMA}.owned_leases`;
export const POSTGRES_OWNERSHIP_CONTRACT = "cms-integration-verifier-postgres-ownership-v2";

export const POSTGRES_OWNERSHIP_STATES = Object.freeze([
    "reserved",
    "role-created",
    "database-created",
    "ready",
    "releasing",
] as const);

export type PostgresOwnershipState = (typeof POSTGRES_OWNERSHIP_STATES)[number];

export type PostgresOwnershipMarker = Readonly<{
    database: string;
    role: string;
    databaseOid: number | null;
    roleOid: number | null;
    serverFingerprint: string;
    instanceId: string;
    leaseToken: string;
    fencingToken: string;
    jobDigest: string;
    state: PostgresOwnershipState;
    leaseExpiresAtMs: number;
    expired: boolean;
}>;

export type PostgresOwnershipIdentity = Pick<
    PostgresOwnershipMarker,
    "database" | "role" | "serverFingerprint" | "instanceId" | "leaseToken" | "fencingToken" | "jobDigest"
>;

export function postgresOwnedObjectComment(marker: PostgresOwnershipIdentity): string {
    return `cms-integration-verifier-owned-object-v1:${marker.fencingToken}:${marker.leaseToken}`;
}

export function assertPostgresOwnershipMarker(marker: PostgresOwnershipMarker): void {
    if (
        !isDisposablePostgresDatabase(marker.database) ||
        !isDisposablePostgresRole(marker.role) ||
        marker.database.slice("cmscore_contracts_".length) !== marker.role.slice("cmsv_".length) ||
        !/^[a-f0-9]{64}$/u.test(marker.serverFingerprint) ||
        !/^[a-f0-9]{32}$/u.test(marker.instanceId) ||
        !/^[a-f0-9]{64}$/u.test(marker.leaseToken) ||
        !/^[1-9]\d*$/u.test(marker.fencingToken) ||
        !/^[a-f0-9]{64}$/u.test(marker.jobDigest) ||
        !POSTGRES_OWNERSHIP_STATES.includes(marker.state) ||
        !Number.isSafeInteger(marker.leaseExpiresAtMs) ||
        marker.leaseExpiresAtMs <= 0 ||
        (marker.databaseOid !== null && (!Number.isSafeInteger(marker.databaseOid) || marker.databaseOid <= 0)) ||
        (marker.roleOid !== null && (!Number.isSafeInteger(marker.roleOid) || marker.roleOid <= 0))
    ) {
        throw new Error("Disposable PostgreSQL ownership marker is invalid");
    }
}

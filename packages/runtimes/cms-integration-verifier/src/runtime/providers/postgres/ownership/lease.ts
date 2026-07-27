import type { SQL } from "bun";
import {
    disposablePostgresStoredRoleSettings,
    postgresIdentifier as identifier,
    postgresLiteral as literal,
    type PostgresProviderConfig,
} from "../configuration";
import {
    postgresOwnedObjectComment,
    POSTGRES_OWNERSHIP_TABLE,
    type PostgresOwnershipIdentity,
    type PostgresOwnershipMarker,
} from "./contract";
import { readPostgresOwnedObjects } from "./objects";
import { readExactPostgresOwnership } from "./reservation";
import { readPostgresOwnership } from "./store";

export async function heartbeatPostgresOwnership(
    admin: SQL,
    marker: PostgresOwnershipIdentity,
    leaseDurationMs: number,
): Promise<void> {
    const rows = await admin.unsafe(
        `update ${POSTGRES_OWNERSHIP_TABLE}
          set lease_expires_at = clock_timestamp() + ($1::bigint * interval '1 millisecond'),
            updated_at = clock_timestamp()
          where database_name = $2 and lease_token = $3 and fencing_token = $4::bigint
            and instance_id = $5 and job_digest = $6 and server_fingerprint = $7
            and state <> 'releasing' and lease_expires_at > clock_timestamp()
          returning database_name`,
        [
            leaseDurationMs,
            marker.database,
            marker.leaseToken,
            marker.fencingToken,
            marker.instanceId,
            marker.jobDigest,
            marker.serverFingerprint,
        ],
    );
    if (rows.length !== 1) {
        throw new Error("Disposable PostgreSQL ownership heartbeat lost its lease or fence");
    }
}

export async function preparePostgresOwnershipRelease(
    admin: SQL,
    identity: PostgresOwnershipIdentity,
): Promise<PostgresOwnershipMarker | null> {
    const marker = (await readPostgresOwnership(admin)).find((entry) => sameOwnership(entry, identity));
    if (!marker) {
        return null;
    }
    const objects = await readPostgresOwnedObjects(admin);
    const database = objects.databases.find((entry) => entry.name === marker.database);
    const role = objects.roles.find((entry) => entry.name === marker.role);
    const comment = postgresOwnedObjectComment(marker);
    if (role && marker.roleOid !== null && (role.oid !== marker.roleOid || role.comment !== comment)) {
        throw new Error("Disposable PostgreSQL release role identity changed");
    }
    if (
        database &&
        marker.databaseOid !== null &&
        (database.oid !== marker.databaseOid || database.comment !== comment)
    ) {
        throw new Error("Disposable PostgreSQL release database identity changed");
    }
    if (database && (database.owner !== database.currentUser || database.template)) {
        throw new Error("Disposable PostgreSQL release database is not provider-owned");
    }
    await admin.begin(async (transaction) => {
        if (role && marker.roleOid === null) {
            await transaction.unsafe(`comment on role ${identifier(marker.role)} is ${literal(comment)}`);
        }
        if (database && marker.databaseOid === null) {
            await transaction.unsafe(`comment on database ${identifier(marker.database)} is ${literal(comment)}`);
        }
        const rows = await transaction.unsafe(
            `update ${POSTGRES_OWNERSHIP_TABLE} set state = 'releasing',
              role_oid = coalesce(role_oid, $1::oid), database_oid = coalesce(database_oid, $2::oid),
              lease_expires_at = clock_timestamp(), updated_at = clock_timestamp()
              where database_name = $3 and lease_token = $4 and fencing_token = $5::bigint
                and instance_id = $6 and job_digest = $7 and server_fingerprint = $8
              returning database_name`,
            [
                role?.oid ?? null,
                database?.oid ?? null,
                marker.database,
                marker.leaseToken,
                marker.fencingToken,
                marker.instanceId,
                marker.jobDigest,
                marker.serverFingerprint,
            ],
        );
        if (rows.length !== 1) {
            throw new Error("Disposable PostgreSQL release lost its ownership fence");
        }
    });
    return await readExactPostgresOwnership(admin, marker);
}

export async function deletePostgresOwnership(admin: SQL, marker: PostgresOwnershipMarker): Promise<void> {
    const rows = await admin.unsafe(
        `delete from ${POSTGRES_OWNERSHIP_TABLE} where database_name = $1 and role_name = $2
          and server_fingerprint = $3 and instance_id = $4 and lease_token = $5
          and fencing_token = $6::bigint and job_digest = $7 and state = 'releasing'
          returning database_name`,
        [
            marker.database,
            marker.role,
            marker.serverFingerprint,
            marker.instanceId,
            marker.leaseToken,
            marker.fencingToken,
            marker.jobDigest,
        ],
    );
    if (rows.length !== 1) {
        throw new Error("Disposable PostgreSQL ownership journal changed before deletion");
    }
}

export async function assertDisposablePostgresRoleSettings(
    admin: SQL,
    marker: PostgresOwnershipMarker,
    config: PostgresProviderConfig,
): Promise<void> {
    if (marker.roleOid === null) {
        throw new Error("Disposable PostgreSQL role settings have no bound role identity");
    }
    const rows = (await admin.unsafe(
        `select setting::text as setting, settings.setdatabase::int as database
      from pg_catalog.pg_db_role_setting settings cross join lateral unnest(settings.setconfig) setting
      where settings.setrole = $1::oid order by settings.setdatabase, setting collate "C"`,
        [marker.roleOid],
    )) as Array<{ setting: string; database: number }>;
    const expected = disposablePostgresStoredRoleSettings(config);
    if (
        rows.length !== expected.length ||
        rows.some((row, index) => row.database !== 0 || row.setting !== expected[index])
    ) {
        throw new Error("Disposable PostgreSQL role settings changed outside the provider contract");
    }
}

function sameOwnership(left: PostgresOwnershipIdentity, right: PostgresOwnershipIdentity): boolean {
    return (
        left.database === right.database &&
        left.role === right.role &&
        left.serverFingerprint === right.serverFingerprint &&
        left.instanceId === right.instanceId &&
        left.leaseToken === right.leaseToken &&
        left.fencingToken === right.fencingToken &&
        left.jobDigest === right.jobDigest
    );
}

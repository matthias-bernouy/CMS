import type { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { randomBytes } from "node:crypto";
import {
    DISPOSABLE_POSTGRES_ROLE_SETTINGS,
    postgresIdentifier as identifier,
    postgresLiteral as literal,
    type PostgresProviderConfig,
} from "../configuration";
import {
    assertPostgresOwnershipMarker,
    postgresOwnedObjectComment,
    POSTGRES_OWNERSHIP_CONTRACT,
    POSTGRES_OWNERSHIP_TABLE,
    type PostgresOwnershipMarker,
} from "./contract";
import { readPostgresOwnership } from "./store";

export async function reservePostgresOwnership(
    admin: SQL,
    input: Readonly<{
        database: string;
        role: string;
        serverFingerprint: string;
        instanceId: string;
        leaseDurationMs: number;
        job: { candidateId: string; packageDigest: string; verificationDigest: string };
    }>,
): Promise<PostgresOwnershipMarker> {
    const jobDigest = await sha256Hex(canonicalJsonBytes(input.job));
    const leaseToken = randomBytes(32).toString("hex");
    const rows = await admin.unsafe(
        `insert into ${POSTGRES_OWNERSHIP_TABLE}
          (database_name, role_name, server_fingerprint, instance_id, lease_token, job_digest,
            state, ownership_contract, lease_expires_at)
          values ($1, $2, $3, $4, $5, $6, 'reserved', $7,
            clock_timestamp() + ($8::bigint * interval '1 millisecond')) returning database_name`,
        [
            input.database,
            input.role,
            input.serverFingerprint,
            input.instanceId,
            leaseToken,
            jobDigest,
            POSTGRES_OWNERSHIP_CONTRACT,
            input.leaseDurationMs,
        ],
    );
    if (rows.length !== 1) {
        throw new Error("Disposable PostgreSQL ownership reservation was not persisted");
    }
    return await readExactPostgresOwnership(admin, { database: input.database, leaseToken });
}

export async function createPostgresOwnedRole(
    admin: SQL,
    marker: PostgresOwnershipMarker,
    password: string,
    config: PostgresProviderConfig,
): Promise<PostgresOwnershipMarker> {
    assertPostgresOwnershipMarker(marker);
    const comment = postgresOwnedObjectComment(marker);
    await admin.begin(async (transaction) => {
        await transaction.unsafe(
            `create role ${identifier(marker.role)} login password ${literal(password)}
              nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 4`,
        );
        const settings = [
            ["statement_timeout", `${config.statementTimeoutMs}ms`],
            ["lock_timeout", DISPOSABLE_POSTGRES_ROLE_SETTINGS.lockTimeout],
            ["idle_in_transaction_session_timeout", DISPOSABLE_POSTGRES_ROLE_SETTINGS.idleInTransactionSessionTimeout],
            ["work_mem", DISPOSABLE_POSTGRES_ROLE_SETTINGS.workMem],
            ["temp_file_limit", DISPOSABLE_POSTGRES_ROLE_SETTINGS.tempFileLimit],
        ] as const;
        for (const [name, value] of settings) {
            await transaction.unsafe(`alter role ${identifier(marker.role)} set ${name} = ${literal(value)}`);
        }
        await transaction.unsafe(`alter role ${identifier(marker.role)} set search_path = public, extensions`);
        await transaction.unsafe(`comment on role ${identifier(marker.role)} is ${literal(comment)}`);
        const updated = await transaction.unsafe(
            `update ${POSTGRES_OWNERSHIP_TABLE} set role_oid = (
                select oid from pg_catalog.pg_roles where rolname = $1
              ), state = 'role-created', updated_at = clock_timestamp()
              where database_name = $2 and lease_token = $3 and fencing_token = $4::bigint
                and state = 'reserved' and lease_expires_at > clock_timestamp()
              returning database_name`,
            [marker.role, marker.database, marker.leaseToken, marker.fencingToken],
        );
        if (updated.length !== 1) {
            throw new Error("Disposable PostgreSQL role creation lost its ownership lease");
        }
    });
    return await readExactPostgresOwnership(admin, marker);
}

export async function bindPostgresOwnedDatabase(
    admin: SQL,
    marker: PostgresOwnershipMarker,
): Promise<PostgresOwnershipMarker> {
    const comment = postgresOwnedObjectComment(marker);
    await admin.begin(async (transaction) => {
        await transaction.unsafe(`revoke all on database ${identifier(marker.database)} from public`);
        await transaction.unsafe(
            `grant connect, create, temporary on database ${identifier(marker.database)} to ${identifier(marker.role)}`,
        );
        await transaction.unsafe(`comment on database ${identifier(marker.database)} is ${literal(comment)}`);
        const updated = await transaction.unsafe(
            `update ${POSTGRES_OWNERSHIP_TABLE} set database_oid = (
                select oid from pg_catalog.pg_database where datname = $1
              ), state = 'database-created', updated_at = clock_timestamp()
              where database_name = $1 and lease_token = $2 and fencing_token = $3::bigint
                and state = 'role-created' and lease_expires_at > clock_timestamp()
              returning database_name`,
            [marker.database, marker.leaseToken, marker.fencingToken],
        );
        if (updated.length !== 1) {
            throw new Error("Disposable PostgreSQL database creation lost its ownership lease");
        }
    });
    return await readExactPostgresOwnership(admin, marker);
}

export async function markPostgresOwnershipReady(
    admin: SQL,
    marker: PostgresOwnershipMarker,
): Promise<PostgresOwnershipMarker> {
    const rows = await admin.unsafe(
        `update ${POSTGRES_OWNERSHIP_TABLE} set state = 'ready', updated_at = clock_timestamp()
          where database_name = $1 and lease_token = $2 and fencing_token = $3::bigint
            and state = 'database-created' and lease_expires_at > clock_timestamp()
          returning database_name`,
        [marker.database, marker.leaseToken, marker.fencingToken],
    );
    if (rows.length !== 1) {
        throw new Error("Disposable PostgreSQL readiness transition lost its ownership lease");
    }
    return await readExactPostgresOwnership(admin, marker);
}

export async function readExactPostgresOwnership(
    admin: SQL,
    identity: Pick<PostgresOwnershipMarker, "database" | "leaseToken">,
): Promise<PostgresOwnershipMarker> {
    const marker = (await readPostgresOwnership(admin)).find(
        (entry) => entry.database === identity.database && entry.leaseToken === identity.leaseToken,
    );
    if (!marker) {
        throw new Error("Disposable PostgreSQL ownership journal entry was not found");
    }
    return marker;
}

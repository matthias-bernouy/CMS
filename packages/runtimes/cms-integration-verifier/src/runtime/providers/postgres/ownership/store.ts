import type { SQL } from "bun";
import {
    assertPostgresOwnershipMarker,
    POSTGRES_OWNERSHIP_CONTRACT,
    POSTGRES_OWNERSHIP_SCHEMA,
    POSTGRES_OWNERSHIP_TABLE,
    type PostgresOwnershipMarker,
} from "./contract";

export async function ensurePostgresOwnershipStore(admin: SQL): Promise<void> {
    const schemas = await ownershipSchemaRows(admin);
    if (schemas.length === 0) {
        await admin.begin(async (transaction) => {
            await transaction.unsafe(`create schema ${POSTGRES_OWNERSHIP_SCHEMA}`);
            await transaction.unsafe(
                `comment on schema ${POSTGRES_OWNERSHIP_SCHEMA} is '${POSTGRES_OWNERSHIP_CONTRACT}'`,
            );
            await transaction.unsafe(`revoke all on schema ${POSTGRES_OWNERSHIP_SCHEMA} from public`);
        });
    } else {
        assertOwnedStoreRow(schemas, "schema");
    }
    const tables = await ownershipTableRows(admin);
    if (tables.length === 0) {
        await admin.begin(async (transaction) => {
            await transaction.unsafe(`create table ${POSTGRES_OWNERSHIP_TABLE} (
          database_name text constraint owned_leases_pkey primary key,
          role_name text not null constraint owned_leases_role_name_key unique,
          database_oid oid,
          role_oid oid,
          server_fingerprint text not null,
          instance_id text not null,
          lease_token text not null constraint owned_leases_lease_token_key unique,
          fencing_token bigint generated always as identity constraint owned_leases_fencing_token_key unique,
          job_digest text not null,
          state text not null constraint owned_leases_state_check
            check (state in ('reserved', 'role-created', 'database-created', 'ready', 'releasing')),
          ownership_contract text not null,
          lease_expires_at timestamptz not null,
          created_at timestamptz not null default clock_timestamp(),
          updated_at timestamptz not null default clock_timestamp(),
          constraint owned_leases_object_state_check
          check ((state = 'reserved' and role_oid is null and database_oid is null)
            or (state = 'role-created' and role_oid is not null and database_oid is null)
            or (state in ('database-created', 'ready') and role_oid is not null and database_oid is not null)
            or state = 'releasing')
        )`);
            await transaction.unsafe(
                `comment on table ${POSTGRES_OWNERSHIP_TABLE} is '${POSTGRES_OWNERSHIP_CONTRACT}'`,
            );
            await transaction.unsafe(`revoke all on ${POSTGRES_OWNERSHIP_TABLE} from public`);
        });
    } else {
        assertOwnedStoreRow(tables, "table");
    }
    await assertPostgresOwnershipStore(admin);
}

export async function assertPostgresOwnershipStore(admin: SQL): Promise<void> {
    assertOwnedStoreRow(await ownershipSchemaRows(admin), "schema");
    assertOwnedStoreRow(await ownershipTableRows(admin), "table");
    const columns = (await admin.unsafe(`select column_name::text as name, udt_name::text as type,
      is_nullable::text as nullable, is_identity::text as identity
      from information_schema.columns where table_schema = '${POSTGRES_OWNERSHIP_SCHEMA}'
        and table_name = 'owned_leases' order by ordinal_position`)) as StoreColumn[];
    const expected: StoreColumn[] = [
        { name: "database_name", type: "text", nullable: "NO", identity: "NO" },
        { name: "role_name", type: "text", nullable: "NO", identity: "NO" },
        { name: "database_oid", type: "oid", nullable: "YES", identity: "NO" },
        { name: "role_oid", type: "oid", nullable: "YES", identity: "NO" },
        { name: "server_fingerprint", type: "text", nullable: "NO", identity: "NO" },
        { name: "instance_id", type: "text", nullable: "NO", identity: "NO" },
        { name: "lease_token", type: "text", nullable: "NO", identity: "NO" },
        { name: "fencing_token", type: "int8", nullable: "NO", identity: "YES" },
        { name: "job_digest", type: "text", nullable: "NO", identity: "NO" },
        { name: "state", type: "text", nullable: "NO", identity: "NO" },
        { name: "ownership_contract", type: "text", nullable: "NO", identity: "NO" },
        { name: "lease_expires_at", type: "timestamptz", nullable: "NO", identity: "NO" },
        { name: "created_at", type: "timestamptz", nullable: "NO", identity: "NO" },
        { name: "updated_at", type: "timestamptz", nullable: "NO", identity: "NO" },
    ];
    if (JSON.stringify(columns) !== JSON.stringify(expected)) {
        throw new Error("Disposable PostgreSQL ownership store structure is invalid");
    }
    const constraints = (await admin.unsafe(`select constraint_name::text as name
      from information_schema.table_constraints where table_schema = '${POSTGRES_OWNERSHIP_SCHEMA}'
        and table_name = 'owned_leases' and constraint_name like 'owned_leases\\_%' escape '\\'
      order by constraint_name collate "C"`)) as Array<{ name: string }>;
    const expectedConstraints = [
        "owned_leases_fencing_token_key",
        "owned_leases_lease_token_key",
        "owned_leases_object_state_check",
        "owned_leases_pkey",
        "owned_leases_role_name_key",
        "owned_leases_state_check",
    ];
    if (
        constraints.length !== expectedConstraints.length ||
        constraints.some((entry, index) => entry.name !== expectedConstraints[index])
    ) {
        throw new Error(
            `Disposable PostgreSQL ownership store constraints are invalid: ${constraints.map(({ name }) => name).join(",")}`,
        );
    }
}

export async function readPostgresOwnership(admin: SQL): Promise<PostgresOwnershipMarker[]> {
    const rows = (await admin.unsafe(`select database_name::text as database, role_name::text as role,
      database_oid::int as "databaseOid", role_oid::int as "roleOid",
      server_fingerprint::text as "serverFingerprint", instance_id::text as "instanceId",
      lease_token::text as "leaseToken", fencing_token::text as "fencingToken",
      job_digest::text as "jobDigest", state::text as state,
      floor(extract(epoch from lease_expires_at) * 1000)::bigint::text as "leaseExpiresAtMs",
      lease_expires_at <= clock_timestamp() as expired, ownership_contract::text as contract
      from ${POSTGRES_OWNERSHIP_TABLE} order by database_name collate "C"`)) as OwnershipRow[];
    return rows.map(({ contract, leaseExpiresAtMs, ...row }) => {
        if (contract !== POSTGRES_OWNERSHIP_CONTRACT) {
            throw new Error("Disposable PostgreSQL ownership marker contract is invalid");
        }
        const marker = { ...row, leaseExpiresAtMs: Number(leaseExpiresAtMs) } as PostgresOwnershipMarker;
        assertPostgresOwnershipMarker(marker);
        return marker;
    });
}

type StoreColumn = { name: string; type: string; nullable: string; identity: string };
type OwnershipRow = Omit<PostgresOwnershipMarker, "leaseExpiresAtMs"> & {
    leaseExpiresAtMs: string;
    contract: string;
};
type StoreOwnershipRow = {
    owner: string;
    comment: string | null;
    currentUser: string;
    publicPrivileges: boolean;
};

async function ownershipSchemaRows(admin: SQL): Promise<StoreOwnershipRow[]> {
    return (await admin.unsafe(`select pg_catalog.pg_get_userbyid(nspowner)::text as owner,
      pg_catalog.obj_description(oid, 'pg_namespace')::text as comment, current_user::text as "currentUser",
      exists(select 1 from pg_catalog.aclexplode(coalesce(nspacl, pg_catalog.acldefault('n', nspowner))) acl
        where acl.grantee = 0) as "publicPrivileges"
      from pg_catalog.pg_namespace where nspname = '${POSTGRES_OWNERSHIP_SCHEMA}'`)) as StoreOwnershipRow[];
}

async function ownershipTableRows(admin: SQL): Promise<StoreOwnershipRow[]> {
    return (await admin.unsafe(`select pg_catalog.pg_get_userbyid(relation.relowner)::text as owner,
      pg_catalog.obj_description(relation.oid, 'pg_class')::text as comment,
      current_user::text as "currentUser",
      exists(select 1 from pg_catalog.aclexplode(coalesce(relation.relacl,
        pg_catalog.acldefault('r', relation.relowner))) acl where acl.grantee = 0) as "publicPrivileges"
      from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = '${POSTGRES_OWNERSHIP_SCHEMA}' and relation.relname = 'owned_leases'
        and relation.relkind = 'r'`)) as StoreOwnershipRow[];
}

function assertOwnedStoreRow(rows: StoreOwnershipRow[], object: string): void {
    const row = rows[0];
    if (
        rows.length !== 1 ||
        !row ||
        row.owner !== row.currentUser ||
        row.comment !== POSTGRES_OWNERSHIP_CONTRACT ||
        row.publicPrivileges
    ) {
        throw new Error(`Disposable PostgreSQL ownership ${object} is not trusted`);
    }
}

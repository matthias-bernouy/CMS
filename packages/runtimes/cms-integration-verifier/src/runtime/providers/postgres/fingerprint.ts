import { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1 } from "@bernouy/cms-integration-verification";

export const POSTGRES_DEDICATED_CLUSTER_CONTRACT = "cms-integration-verifier-dedicated-postgres-v1" as const;

export async function assertDedicatedPostgresCluster(admin: SQL, expectedDatabase: string): Promise<void> {
    const rows = (await admin.unsafe(`select current_database()::text as database,
      current_user::text as "currentUser", pg_catalog.pg_get_userbyid(database.datdba)::text as owner,
      pg_catalog.shobj_description(database.oid, 'pg_database')::text as comment,
      database.datallowconn as "allowsConnections", database.datistemplate as template
      from pg_catalog.pg_database database where database.datname = current_database()`)) as Array<{
        database: string;
        currentUser: string;
        owner: string;
        comment: string | null;
        allowsConnections: boolean;
        template: boolean;
    }>;
    const row = rows[0];
    if (
        rows.length !== 1 ||
        !row ||
        row.database !== expectedDatabase ||
        row.owner !== row.currentUser ||
        row.comment !== POSTGRES_DEDICATED_CLUSTER_CONTRACT ||
        !row.allowsConnections ||
        row.template
    ) {
        throw new Error("PostgreSQL server is not explicitly provisioned for disposable verification workloads");
    }
    const foreignDatabases = (await admin.unsafe(
        `select datname::text as name from pg_catalog.pg_database
      where datallowconn and not datistemplate and datname <> $1
        and datname !~ '^cmscore_contracts_[a-f0-9]{24}$'
      order by datname collate "C"`,
        [expectedDatabase],
    )) as Array<{ name: string }>;
    if (foreignDatabases.length > 0) {
        throw new Error("Dedicated verification PostgreSQL contains an unrelated database");
    }
}

export async function readPostgresServerFingerprint(admin: SQL): Promise<string> {
    const rows = (await admin.unsafe(`select control.system_identifier::text as "systemIdentifier",
      current_setting('server_version')::text as version,
      current_setting('server_version_num')::text as "versionNumber"
      from pg_catalog.pg_control_system() control`)) as Array<{
        systemIdentifier: string;
        version: string;
        versionNumber: string;
    }>;
    const row = rows[0];
    if (
        rows.length !== 1 ||
        !row ||
        !/^\d{10,32}$/u.test(row.systemIdentifier) ||
        row.version !== CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.postgres.version ||
        row.versionNumber !== "160014"
    ) {
        throw new Error("Disposable PostgreSQL server does not match the pinned verification environment");
    }
    return await sha256Hex(
        canonicalJsonBytes({
            contract: "cms-integration-verifier-postgres-server-v1",
            systemIdentifier: row.systemIdentifier,
            version: row.version,
            versionNumber: row.versionNumber,
        }),
    );
}

export async function assertPostgresServerFingerprint(admin: SQL, expected: string): Promise<void> {
    if ((await readPostgresServerFingerprint(admin)) !== expected) {
        throw new Error("Disposable PostgreSQL server fingerprint changed");
    }
}

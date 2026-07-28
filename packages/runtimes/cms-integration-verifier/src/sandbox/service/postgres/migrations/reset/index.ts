import { SQL } from "bun";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { readBoundarySnapshot } from "../../catalog";
import { attestMigrationEnvironment } from "./environment";

type TrustedBaseline = Readonly<{ digest: string }>;

export async function assertDisposableMigrationTarget(database: SQL, expectedDatabaseId: string): Promise<void> {
    const rows = (await database.unsafe(`select current_database()::text as database, current_user::text as role,
        role_row.rolsuper, role_row.rolcreatedb, role_row.rolcreaterole, role_row.rolreplication,
        role_row.rolbypassrls, role_row.rolinherit,
        pg_has_role(current_user, 'pg_read_server_files', 'member') as read_server_files,
        pg_has_role(current_user, 'pg_write_server_files', 'member') as write_server_files,
        pg_has_role(current_user, 'pg_execute_server_program', 'member') as execute_server_program
      from pg_catalog.pg_roles role_row where role_row.rolname = current_user`)) as Array<{
        database: string;
        role: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
        rolinherit: boolean;
        read_server_files: boolean;
        write_server_files: boolean;
        execute_server_program: boolean;
    }>;
    const target = rows[0];
    if (
        rows.length !== 1 ||
        target?.database !== expectedDatabaseId ||
        !/^cmscore_contracts_[a-f0-9]{24}$/u.test(target.database) ||
        !/^cmsv_[a-f0-9]{24}$/u.test(target.role) ||
        target.rolsuper ||
        target.rolcreatedb ||
        target.rolcreaterole ||
        target.rolreplication ||
        target.rolbypassrls ||
        target.rolinherit ||
        target.read_server_files ||
        target.write_server_files ||
        target.execute_server_program
    ) {
        throw new TypeError("Migration verification refused a non-disposable or privileged PostgreSQL target");
    }
}

export async function establishTrustedBaseline(database: SQL): Promise<TrustedBaseline> {
    await resetDisposableDatabase(database);
    return { digest: (await readBoundarySnapshot(database, [])).digest };
}

export async function attestTrustedEnvironment(
    database: SQL,
    environment: MigrationVerificationInputV1["environment"],
): Promise<string> {
    return await attestMigrationEnvironment(database, environment);
}

export async function restoreTrustedBaseline(database: SQL, baseline: TrustedBaseline): Promise<void> {
    await resetDisposableDatabase(database);
    const restored = await readBoundarySnapshot(database, []);
    if (restored.digest !== baseline.digest) {
        throw new Error("Disposable PostgreSQL reset did not restore the trusted bootstrap state");
    }
}

async function resetDisposableDatabase(database: SQL): Promise<void> {
    await database.unsafe("ROLLBACK").catch(() => undefined);
    // Candidate SQL shares this one bounded session across the dependency
    // matrices. Clear every candidate-controlled session surface except server
    // prepared statements: Bun owns those and DISCARD/DEALLOCATE ALL would
    // desynchronise its client-side statement cache.
    await database.unsafe("CLOSE ALL");
    await database.unsafe("RESET ROLE");
    await database.unsafe("RESET ALL");
    await database.unsafe("UNLISTEN *");
    await database.unsafe("SELECT pg_catalog.pg_advisory_unlock_all()");
    await database.unsafe("DISCARD PLANS");
    await database.unsafe("DISCARD SEQUENCES");
    await database.unsafe("DISCARD TEMP");
    const schemas = (await database.unsafe(`select namespace.nspname::text as name
      from pg_catalog.pg_namespace namespace
      where namespace.nspowner = (select oid from pg_catalog.pg_roles where rolname = current_user)
      order by namespace.nspname collate "C"`)) as Array<{ name: string }>;
    for (const { name } of schemas) {
        if (name.startsWith("pg_")) {
            throw new Error("Disposable PostgreSQL role unexpectedly owns a system schema");
        }
        await database.unsafe(`DROP SCHEMA ${quoteIdentifier(name)} CASCADE`);
    }
    const publications = (await database.unsafe(`select publication.pubname::text as name
      from pg_catalog.pg_publication publication
      where publication.pubowner = (select oid from pg_catalog.pg_roles where rolname = current_user)
      order by publication.pubname collate "C"`)) as Array<{ name: string }>;
    for (const { name } of publications) {
        await database.unsafe(`DROP PUBLICATION ${quoteIdentifier(name)}`);
    }
    await database.unsafe(`select pg_catalog.lo_unlink(metadata.oid)
      from pg_catalog.pg_largeobject_metadata metadata
      where metadata.lomowner = (select oid from pg_catalog.pg_roles where rolname = current_user)`);
    const persistentDefaults = await database.unsafe(`select 1
      from pg_catalog.pg_default_acl defaults
      where defaults.defaclrole = (select oid from pg_catalog.pg_roles where rolname = current_user)
      limit 1`);
    if (persistentDefaults.length !== 0) {
        throw new TypeError("Disposable PostgreSQL reset found persistent role default privileges");
    }
    await database.unsafe("CREATE SCHEMA storage");
    await database.unsafe(`CREATE TABLE storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL UNIQUE,
        owner uuid,
        public boolean NOT NULL DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[]
    )`);
}

function quoteIdentifier(value: string): string {
    if (!value || value.includes("\0")) {
        throw new TypeError("Unsafe PostgreSQL identifier in disposable reset");
    }
    return `"${value.replaceAll('"', '""')}"`;
}

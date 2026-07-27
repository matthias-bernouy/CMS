import { SQL } from "bun";
import {
    databaseUri,
    postgresAdministrativeDatabaseIdentifier,
    postgresIdentifier as identifier,
    type PostgresProviderConfig,
} from "./configuration";
import { installExtensionGuard } from "./security";

export async function ensureSharedRoles(admin: SQL): Promise<void> {
    const databases = (await admin.unsafe(
        "select datname::text as name from pg_catalog.pg_database where datallowconn order by datname",
    )) as Array<{ name: string }>;
    for (const { name } of databases) {
        await admin.unsafe(
            `revoke connect, temporary on database ${postgresAdministrativeDatabaseIdentifier(name)} from public`,
        );
    }
    await admin.unsafe(`do $$
begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$`);
    await assertSharedRoles(admin);
}

export async function assertSharedRoles(admin: SQL): Promise<void> {
    const rows = (await admin.unsafe(`select rolname::text as name, rolcanlogin as login,
      rolbypassrls as "bypassRls", rolsuper, rolcreatedb, rolcreaterole, rolreplication
      from pg_catalog.pg_roles where rolname = any(array['anon', 'authenticated', 'service_role']::text[])
      order by rolname collate "C"`)) as Array<{
        name: string;
        login: boolean;
        bypassRls: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
    }>;
    const expected = [
        { name: "anon", bypassRls: false },
        { name: "authenticated", bypassRls: false },
        { name: "service_role", bypassRls: true },
    ];
    if (
        rows.length !== expected.length ||
        rows.some(
            (row, index) =>
                row.name !== expected[index]?.name ||
                row.bypassRls !== expected[index]?.bypassRls ||
                row.login ||
                row.rolsuper ||
                row.rolcreatedb ||
                row.rolcreaterole ||
                row.rolreplication,
        )
    ) {
        throw new Error("Disposable PostgreSQL shared roles do not match the verification contract");
    }
}

export async function bootstrapDatabase(config: PostgresProviderConfig, database: string, role: string): Promise<void> {
    const sql = new SQL(databaseUri(config, database, config.user, config.password), { max: 1 });
    try {
        await sql.unsafe("create schema if not exists extensions");
        await sql.unsafe("create extension if not exists pgcrypto with schema extensions");
        await sql.unsafe(`grant usage on schema extensions to ${identifier(role)}`);
        await installExtensionGuard(sql);
        await sql.unsafe(`set role ${identifier(role)}`);
        await sql.unsafe("create schema if not exists storage");
        await sql.unsafe(`create table if not exists storage.buckets (
            id text primary key,
            name text not null unique,
            owner uuid,
            public boolean not null default false,
            file_size_limit bigint,
            allowed_mime_types text[]
        )`);
        await sql.unsafe("reset role");
    } finally {
        await sql.close();
    }
}

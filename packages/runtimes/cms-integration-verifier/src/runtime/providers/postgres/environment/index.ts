import { SQL } from "bun";
import { databaseUri, postgresIdentifier, type PostgresProviderConfig } from "../configuration";
import { assertSupabaseAuthEnvironment, installSupabaseAuthEnvironment } from "./auth";
import { installExtensionGuard } from "./extensionGuard";

export { assertDisposablePostgresSessionSettings } from "./session";
export {
    assertSandboxActorMemberships,
    assertSharedRoles,
    ensureSharedRoles,
    grantSandboxActorMemberships,
} from "./roles";

export async function bootstrapDatabase(config: PostgresProviderConfig, database: string, role: string): Promise<void> {
    const sql = new SQL(databaseUri(config, database, config.user, config.password), { max: 1 });
    try {
        await sql.unsafe("create schema extensions");
        await sql.unsafe("create extension pgcrypto with schema extensions");
        await sql.unsafe(`grant usage on schema extensions to ${postgresIdentifier(role)}`);
        await installExtensionGuard(sql);
        await installSupabaseAuthEnvironment(sql, role);
        await sql.unsafe(`set role ${postgresIdentifier(role)}`);
        await sql.unsafe("create schema storage");
        await sql.unsafe(`create table storage.buckets (
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

export async function assertDatabaseEnvironment(database: SQL): Promise<void> {
    await assertSupabaseAuthEnvironment(database);
}

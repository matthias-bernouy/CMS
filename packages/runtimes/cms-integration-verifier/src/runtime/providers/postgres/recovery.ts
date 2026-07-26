import { SQL } from "bun";
import {
    isDisposablePostgresDatabase,
    isDisposablePostgresRole,
    postgresIdentifier as identifier,
} from "./configuration";

export async function recoverDisposablePostgresObjects(admin: SQL): Promise<void> {
    const databases = (await admin.unsafe(
        "select datname::text as name from pg_catalog.pg_database where datname ~ '^cmscore_contracts_[a-f0-9]{24}$' order by datname",
    )) as Array<{ name: string }>;
    for (const { name } of databases) {
        if (!isDisposablePostgresDatabase(name)) {
            throw new TypeError("Disposable PostgreSQL recovery returned an unsafe database identity");
        }
        await admin.unsafe(`drop database ${identifier(name)} with (force)`);
    }

    const roles = (await admin.unsafe(
        "select rolname::text as name from pg_catalog.pg_roles where rolname ~ '^cmsv_[a-f0-9]{24}$' order by rolname",
    )) as Array<{ name: string }>;
    for (const { name } of roles) {
        if (!isDisposablePostgresRole(name)) {
            throw new TypeError("Disposable PostgreSQL recovery returned an unsafe role identity");
        }
        await admin.unsafe(`drop role ${identifier(name)}`);
    }
}

import { SQL } from "bun";
import { DISPOSABLE_POSTGRES_ROLE_SETTINGS, type PostgresProviderConfig } from "./configuration";

export async function installExtensionGuard(database: SQL): Promise<void> {
    await database.unsafe("create schema cms_verifier_guard");
    await database.unsafe("revoke all on schema cms_verifier_guard from public");
    await database.unsafe(`create function cms_verifier_guard.enforce_extension_allowlist()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
    command record;
begin
    if tg_tag = 'ALTER EXTENSION' then
        raise exception 'verification database extensions are immutable';
    end if;
    for command in
        select object_identity
        from pg_event_trigger_ddl_commands()
        where object_type = 'extension'
    loop
        if command.object_identity <> 'pgcrypto' then
            raise exception 'verification database extension is not allowlisted';
        end if;
    end loop;
end
$guard$`);
    await database.unsafe(`create event trigger cms_verifier_extension_allowlist
on ddl_command_end
when tag in ('CREATE EXTENSION', 'ALTER EXTENSION')
execute function cms_verifier_guard.enforce_extension_allowlist()`);
}

export async function assertDisposablePostgresSessionSettings(
    database: SQL,
    config: PostgresProviderConfig,
): Promise<void> {
    const rows = (await database.unsafe(`select
      extract(epoch from current_setting('statement_timeout')::interval) * 1000 as "statementTimeoutMs",
      extract(epoch from current_setting('lock_timeout')::interval) * 1000 as "lockTimeoutMs",
      extract(epoch from current_setting('idle_in_transaction_session_timeout')::interval) * 1000
        as "idleTransactionTimeoutMs",
      current_setting('search_path')::text as "searchPath",
      pg_catalog.pg_size_bytes(current_setting('work_mem'))::text as "workMemBytes"`)) as Array<{
        statementTimeoutMs: number;
        lockTimeoutMs: number;
        idleTransactionTimeoutMs: number;
        searchPath: string;
        workMemBytes: string;
    }>;
    const row = rows[0];
    if (
        rows.length !== 1 ||
        !row ||
        Number(row.statementTimeoutMs) !== config.statementTimeoutMs ||
        Number(row.lockTimeoutMs) !== 10_000 ||
        Number(row.idleTransactionTimeoutMs) !== 30_000 ||
        row.searchPath.replaceAll(" ", "") !== DISPOSABLE_POSTGRES_ROLE_SETTINGS.searchPath ||
        row.workMemBytes !== String(16 * 1024 * 1024)
    ) {
        throw new Error("Disposable PostgreSQL startup settings do not match the sandbox contract");
    }
}

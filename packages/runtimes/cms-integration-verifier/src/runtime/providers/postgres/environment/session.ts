import type { SQL } from "bun";
import { DISPOSABLE_POSTGRES_ROLE_SETTINGS, type PostgresProviderConfig } from "../configuration";

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

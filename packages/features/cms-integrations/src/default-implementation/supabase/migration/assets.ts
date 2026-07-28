import { canonicalJsonBytes, resolveIntegrationPackageLimits, sha256Hex } from "@bernouy/cms-integration-packages";
import { readBoundedRegularFile } from "@bernouy/cms-integration-packages/fs";
import { join } from "node:path";
import { IntegrationRuntimeError } from "../../../core/errors";
import type {
    DeclarativeConnectorMigrationDescriptor,
    DeclarativeConnectorRepeatableDescriptor,
    IntegrationMigrationChecksum,
} from "../../../interfaces/IntegrationConnectorDeployer";
import { resolveSqlReference } from "../sql/pathSecurity";
import type { LoadedSupabaseSqlSchema } from "../sql/schemaLoader";

const limits = resolveIntegrationPackageLimits();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export type LoadedSupabaseMigration = DeclarativeConnectorMigrationDescriptor & { sql: string };
export type LoadedSupabaseRepeatable = DeclarativeConnectorRepeatableDescriptor & { sql: string };

export async function computeSupabaseInstallDigest(
    schemas: Pick<LoadedSupabaseSqlSchema, "id" | "kind" | "sql" | "sourceFiles">[],
): Promise<IntegrationMigrationChecksum> {
    const digest = await sha256Hex(canonicalJsonBytes(schemas));
    return `sha256:${digest}`;
}

export async function loadSupabaseMigrationAssets(
    connectorRoot: string,
    migrations: DeclarativeConnectorMigrationDescriptor[],
): Promise<LoadedSupabaseMigration[]> {
    return await Promise.all(
        migrations.map(async (entry) => ({ ...entry, sql: await readCheckedSql(connectorRoot, entry) })),
    );
}

export async function loadSupabaseRepeatableAssets(
    connectorRoot: string,
    repeatables: DeclarativeConnectorRepeatableDescriptor[],
): Promise<LoadedSupabaseRepeatable[]> {
    return await Promise.all(
        repeatables.map(async (entry) => ({ ...entry, sql: await readCheckedSql(connectorRoot, entry) })),
    );
}

async function readCheckedSql(
    connectorRoot: string,
    descriptor: { id: string; path: string; checksum: IntegrationMigrationChecksum },
): Promise<string> {
    const path = await resolveSqlReference({
        connectorRoot,
        bundleRoot: connectorRoot,
        fromFile: join(connectorRoot, "connector.json"),
        reference: descriptor.path,
        extension: ".sql",
    });
    const bytes = await readBoundedRegularFile(path, 0, limits);
    const actual = `sha256:${await sha256Hex(bytes)}`;
    if (actual !== descriptor.checksum) {
        throw new IntegrationRuntimeError(
            `Supabase migration "${descriptor.id}" checksum mismatch: expected ${descriptor.checksum}, received ${actual}`,
        );
    }
    let sql: string;
    try {
        sql = decoder.decode(bytes);
    } catch {
        throw new IntegrationRuntimeError(`Supabase migration "${descriptor.id}" must be valid UTF-8`);
    }
    assertMigrationSqlSafe(sql, descriptor.id);
    return sql;
}

function assertMigrationSqlSafe(sql: string, migrationId: string): void {
    const forbidden = [
        { pattern: /\bCOPY\b[\s\S]*?\bPROGRAM\b/i, label: "COPY PROGRAM" },
        { pattern: /\bCREATE\s+EXTENSION\b/i, label: "CREATE EXTENSION" },
        { pattern: /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|PREPARE\s+TRANSACTION)\s*;/i, label: "transaction control" },
    ];
    const finding = forbidden.find((entry) => entry.pattern.test(sql));
    if (finding) {
        throw new IntegrationRuntimeError(`Supabase migration "${migrationId}" contains forbidden ${finding.label}`);
    }
}

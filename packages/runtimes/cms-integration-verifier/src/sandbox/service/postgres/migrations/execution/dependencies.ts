import type { SQL } from "bun";
import { loadConnectorSchemas, type MigrationPackageLoader } from "../packages";
import type { ExactMigrationPackage } from "../types";

export async function applyExactDependencies(
    database: SQL,
    loader: MigrationPackageLoader,
    packages: readonly ExactMigrationPackage[],
    signal: AbortSignal,
): Promise<void> {
    for (const entry of packages) {
        signal.throwIfAborted();
        await loader.useTransient(entry, async (loaded) => {
            for (const connector of loaded.definition.connectors ?? []) {
                if (connector.provider !== "supabase" || !connector.schemas?.length) {
                    continue;
                }
                for (const schema of await loadConnectorSchemas(loaded, connector)) {
                    signal.throwIfAborted();
                    await database.unsafe(schema.sql);
                }
            }
        });
    }
}

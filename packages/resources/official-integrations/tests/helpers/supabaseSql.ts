import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseSqlBundle } from "@bernouy/cms-integrations/supabase";

export async function loadSupabaseSchemaSql(
    integrationVersionRoot: string | URL,
    manifest = "sql/schema.manifest.json",
): Promise<string> {
    const root = integrationVersionRoot instanceof URL ? fileURLToPath(integrationVersionRoot) : integrationVersionRoot;
    const connectorRoot = resolve(root, "connectors/supabase");
    return (await loadSupabaseSqlBundle(connectorRoot, manifest)).sql;
}

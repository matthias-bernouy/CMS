import type { SQL } from "bun";
import type { SupabaseSchemaCatalogQueryClient } from "@bernouy/cms-integrations/supabase";

export function schemaCatalogClient(database: SQL): SupabaseSchemaCatalogQueryClient {
    return {
        query: async (statement, parameters) => {
            const values = parameters.map((parameter) =>
                Array.isArray(parameter) ? database.array(parameter, "TEXT") : parameter,
            );
            return (await database.unsafe(statement, values)) as readonly Record<string, unknown>[];
        },
    };
}

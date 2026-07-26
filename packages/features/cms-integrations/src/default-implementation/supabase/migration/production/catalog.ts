import { IntegrationRuntimeError } from "../../../../core/errors";
import type { SupabaseSchemaCatalogQueryClient } from "../../schema-observation";
import type { SupabaseManagementClient } from "../../SupabaseManagementClient";
import { literal } from "../sqlFormat";

export class SupabaseManagementCatalogQueryClient implements SupabaseSchemaCatalogQueryClient {
    constructor(private readonly client: SupabaseManagementClient) {}

    async query(statement: string, parameters: readonly unknown[]) {
        if (
            parameters.length !== 1 ||
            !Array.isArray(parameters[0]) ||
            parameters[0].some((value) => typeof value !== "string") ||
            !statement.includes("$1::text[]")
        ) {
            throw new IntegrationRuntimeError("Supabase schema observation received unsupported query parameters");
        }
        const values = (parameters[0] as string[]).map(literal).join(", ");
        return await this.client.readDatabaseRows(statement.replaceAll("$1::text[]", `ARRAY[${values}]::text[]`));
    }
}

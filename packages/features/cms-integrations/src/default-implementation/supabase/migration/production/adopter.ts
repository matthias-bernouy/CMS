import { IntegrationRuntimeError } from "../../../../core/errors";
import {
    identifyObservedSchemaContract,
    sameObservedSchemaContract,
} from "../../../../core/parsing/templates/connector-compatibility";
import type {
    IntegrationConnectorBaselineAdopter,
    IntegrationConnectorBaselineAdoptionContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { readSupabaseObservedSchemaContract } from "../../schema-observation";
import { SupabaseManagementClient } from "../../SupabaseManagementClient";
import { buildSupabaseBaselineAdoptionSql, confirmSupabaseBaselineAdoptionSql } from "./adoptionSql";
import { SupabaseManagementCatalogQueryClient } from "./catalog";
import {
    type ConfiguredSupabaseMigrationServicesConfig,
    redactSupabaseAccessToken,
    resolveSupabaseMigrationConfig,
} from "./config";

export class ConfiguredSupabaseConnectorBaselineAdopter implements IntegrationConnectorBaselineAdopter {
    readonly provider = "supabase";

    constructor(private readonly config: ConfiguredSupabaseMigrationServicesConfig) {}

    async adopt(context: IntegrationConnectorBaselineAdoptionContext) {
        if (context.provider !== this.provider) {
            throw new IntegrationRuntimeError(`Supabase baseline adopter cannot adopt provider "${context.provider}"`);
        }
        assertBaselineOwner(context);
        const resolved = await resolveSupabaseMigrationConfig(this.config);
        const client = new SupabaseManagementClient({
            projectRef: resolved.projectRef,
            accessToken: resolved.accessToken,
            apiBaseUrl: (resolved.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, ""),
            fetch: resolved.fetch ?? fetch,
        });
        try {
            const expected = context.baseline.observedSchema;
            const observed = await readSupabaseObservedSchemaContract({
                client: new SupabaseManagementCatalogQueryClient(client),
                owner: expected.owner,
                ownedNamespaces: expected.namespaces.map((namespace) => namespace.name),
            });
            if (!sameObservedSchemaContract(expected, observed)) {
                throw new IntegrationRuntimeError(
                    "Supabase schema does not exactly match the immutable legacy adoption baseline",
                    409,
                );
            }
            const baselineDigest = (await identifyObservedSchemaContract(expected)).digest;
            await client.applyMigrationTransaction(buildSupabaseBaselineAdoptionSql(context, baselineDigest));
            const confirmation = await client.readDatabaseRows(
                confirmSupabaseBaselineAdoptionSql(context, baselineDigest),
            );
            if (confirmation.length !== 1) {
                throw new IntegrationRuntimeError(
                    "Supabase did not persist the exact connector baseline identity",
                    502,
                );
            }
            return {
                baselineDigest,
                externalOperationId: `supabase-baseline:${context.connectorInstanceId}:${baselineDigest}`,
                outputs: { functionsBaseUrl: resolved.functionsBaseUrl },
            };
        } catch (error) {
            throw redactSupabaseAccessToken(error, resolved.accessToken);
        }
    }
}

function assertBaselineOwner(context: IntegrationConnectorBaselineAdoptionContext): void {
    const owner = context.baseline.observedSchema.owner;
    if (owner.connectorKey !== context.connectorKey || owner.lineageId !== context.lineageId) {
        throw new IntegrationRuntimeError("Supabase legacy baseline owner does not match the target connector", 409);
    }
}

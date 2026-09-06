import { IntegrationRuntimeError } from "../../core/errors";
import { randomUUID } from "node:crypto";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
    IntegrationConnectorFunctionDeployment,
    IntegrationConnectorResourceResult,
} from "../../interfaces/IntegrationConnectorDeployer";
import { buildFunctionBody } from "./functionBundle";
import { requiredText, resolveExistingSupabaseDirectory } from "./paths";
import { loadSupabaseSqlSchemas } from "./sql/schemaLoader";
import { SupabaseManagementClient } from "./SupabaseManagementClient";
import type { SupabaseConnectorDeployerConfig, SupabaseConnectorFunctionSecrets } from "./types";
import { computeSupabaseInstallDigest } from "./migration/assets";
import { buildSupabaseFreshInstallSql } from "./migration/sql";

export type { SupabaseConnectorDeployerConfig, SupabaseConnectorFunctionSecrets } from "./types";

export class SupabaseConnectorDeployer implements IntegrationConnectorDeployer {
    readonly provider = "supabase";

    private readonly projectRef: string;
    private readonly functionsBaseUrl: string;
    private readonly functionSecrets?: SupabaseConnectorFunctionSecrets;
    private readonly client: SupabaseManagementClient;

    constructor(config: SupabaseConnectorDeployerConfig) {
        this.projectRef = requiredText(config.projectRef, "projectRef");
        const accessToken = requiredText(config.accessToken, "accessToken");
        this.functionsBaseUrl = (
            config.functionsBaseUrl ?? `https://${this.projectRef}.supabase.co/functions/v1`
        ).replace(/\/+$/, "");
        this.functionSecrets = config.functionSecrets;
        this.client = new SupabaseManagementClient({
            projectRef: this.projectRef,
            accessToken,
            apiBaseUrl: (config.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, ""),
            fetch: config.fetch ?? fetch,
        });
    }

    async previewOutputs(): Promise<Record<string, string>> {
        return { functionsBaseUrl: this.functionsBaseUrl };
    }

    async deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult> {
        this.validateDeployment(deployment);
        const connectorRoot = await this.connectorRoot(deployment, context);
        const resources: IntegrationConnectorResourceResult[] = [];
        let reloadSchemaCache = false;
        const schemas = await loadSupabaseSqlSchemas(connectorRoot, deployment.schemas);
        if (deployment.migration) {
            const packageDigest = requiredPackageDigest(context.packageDigest);
            const digest = await computeSupabaseInstallDigest(schemas);
            if (digest !== deployment.migration.plan.install.digest) {
                throw new IntegrationRuntimeError(
                    `Supabase install baseline digest mismatch for connector "${deployment.migration.connectorKey}": expected ${deployment.migration.plan.install.digest}, received ${digest}`,
                );
            }
            await this.client.applyMigrationTransaction(
                buildSupabaseFreshInstallSql({
                    integrationKind: deployment.integrationKind,
                    version: deployment.version as string,
                    provider: deployment.provider,
                    migration: deployment.migration,
                    schemas,
                    attemptId: randomUUID(),
                    packageDigest,
                }),
            );
            resources.push(
                ...schemas.map((schema) => ({ type: "schema" as const, id: schema.id, action: "applied" as const })),
            );
            resources.push({ type: "schema", id: "cms_integration_runtime.migration_ledger", action: "applied" });
            reloadSchemaCache = schemas.length > 0;
        } else {
            for (const schema of schemas) {
                await this.client.applySchema(schema.sql);
                resources.push({ type: "schema", id: schema.id, action: "applied" });
                reloadSchemaCache = true;
            }
        }

        if (deployment.dataApiSchemas.length) {
            const { action, schemas } = await this.client.ensureDataApiSchemas(deployment.dataApiSchemas);
            resources.push({ type: "config", id: "postgrest.db_schema", action });
            await this.client.ensurePostgrestDatabaseSchemas(schemas);
            resources.push({ type: "config", id: "postgrest.database_role", action: "applied" });
            reloadSchemaCache = true;
        }

        if (reloadSchemaCache) {
            await this.client.reloadPostgrestSchemaCache();
            resources.push({ type: "config", id: "postgrest.schema_cache", action: "applied" });
        }

        for (const fn of deployment.functions) {
            await this.deployFunction(connectorRoot, deployment, fn, context, resources);
        }

        return {
            provider: this.provider,
            ...(deployment.migration
                ? {
                      connectorKey: deployment.migration.connectorKey,
                      lineageId: deployment.migration.lineageId,
                      migrationRevision: deployment.migration.migrationRevision,
                      connectorInstanceId: deployment.migration.connectorInstanceId,
                  }
                : {}),
            outputs: { functionsBaseUrl: this.functionsBaseUrl },
            resources,
        };
    }

    private validateDeployment(deployment: IntegrationConnectorDeployment): void {
        if (deployment.provider !== this.provider) {
            throw new IntegrationRuntimeError(`Supabase deployer cannot deploy provider "${deployment.provider}"`);
        }
        if (!deployment.version) {
            throw new IntegrationRuntimeError("Supabase connector deployment requires a version");
        }
    }

    private async connectorRoot(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<string> {
        const packageRoot = context.packageRoot?.trim();
        if (!packageRoot) {
            throw new IntegrationRuntimeError("Supabase connector deployment requires a resolved package root");
        }
        return await resolveExistingSupabaseDirectory(packageRoot, deployment.root ?? "");
    }

    private async deployFunction(
        connectorRoot: string,
        deployment: IntegrationConnectorDeployment,
        fn: IntegrationConnectorFunctionDeployment,
        context: IntegrationConnectorDeployContext,
        resources: IntegrationConnectorResourceResult[],
    ): Promise<void> {
        const mergedSecrets = { ...this.resolveFunctionSecrets(deployment, fn, context), ...(fn.secrets ?? {}) };
        const secrets = Object.entries(mergedSecrets)
            .filter(([name]) => !deployment.preserveSecrets?.includes(name))
            .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
            .map(([name, value]) => ({ name, value }));
        if (secrets.length) {
            await this.client.setFunctionSecrets(secrets);
            resources.push(
                ...secrets.map(({ name }) => ({ type: "secret" as const, id: name, action: "set" as const })),
            );
        }

        if (fn.configPath) {
            resources.push({ type: "config", id: fn.configPath, action: "applied" });
        }
        await this.client.deployFunction(fn.name, await buildFunctionBody(connectorRoot, fn));
        resources.push({ type: "function", id: fn.name, action: "deployed" });
    }

    private resolveFunctionSecrets(
        deployment: IntegrationConnectorDeployment,
        fn: IntegrationConnectorFunctionDeployment,
        context: IntegrationConnectorDeployContext,
    ): Record<string, string | undefined> {
        if (!this.functionSecrets) {
            return {};
        }
        return typeof this.functionSecrets === "function"
            ? this.functionSecrets({ deployment, fn, context })
            : this.functionSecrets;
    }
}

function requiredPackageDigest(value: string | undefined): string {
    if (!value || !/^[a-f0-9]{64}$/.test(value)) {
        throw new IntegrationRuntimeError(
            "Supabase migration-aware connector deployment requires an exact package digest",
        );
    }
    return value;
}

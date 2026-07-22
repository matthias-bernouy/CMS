import { readFile } from "node:fs/promises";
import { IntegrationRuntimeError } from "../../core/errors";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
    IntegrationConnectorFunctionDeployment,
    IntegrationConnectorResourceResult,
} from "../../interfaces/IntegrationConnectorDeployer";
import { buildFunctionBody } from "./functionBundle";
import { requiredText, safeJoin } from "./paths";
import { SupabaseManagementClient } from "./SupabaseManagementClient";
import type { SupabaseConnectorDeployerConfig, SupabaseConnectorFunctionSecrets } from "./types";

export type { SupabaseConnectorDeployerConfig, SupabaseConnectorFunctionSecrets } from "./types";

export class SupabaseConnectorDeployer implements IntegrationConnectorDeployer {
    readonly provider = "supabase";

    private readonly integrationsRoot: string;
    private readonly projectRef: string;
    private readonly functionSecrets?: SupabaseConnectorFunctionSecrets;
    private readonly client: SupabaseManagementClient;

    constructor(config: SupabaseConnectorDeployerConfig) {
        this.integrationsRoot = config.integrationsRoot;
        this.projectRef = requiredText(config.projectRef, "projectRef");
        const accessToken = requiredText(config.accessToken, "accessToken");
        this.functionSecrets = config.functionSecrets;
        this.client = new SupabaseManagementClient({
            projectRef: this.projectRef,
            accessToken,
            apiBaseUrl: (config.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, ""),
            fetch: config.fetch ?? fetch,
        });
    }

    async deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult> {
        this.validateDeployment(deployment);
        const connectorRoot = this.connectorRoot(deployment);
        const resources: IntegrationConnectorResourceResult[] = [];
        let reloadSchemaCache = false;

        for (const schema of deployment.schemas) {
            const sql = await readFile(safeJoin(connectorRoot, schema.path), "utf-8");
            await this.client.applySchema(sql);
            resources.push({ type: "schema", id: schema.path, action: "applied" });
            reloadSchemaCache = true;
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
            outputs: { functionsBaseUrl: `https://${this.projectRef}.supabase.co/functions/v1` },
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

    private connectorRoot(deployment: IntegrationConnectorDeployment): string {
        return safeJoin(
            this.integrationsRoot,
            deployment.integrationKind,
            "versions",
            deployment.version ?? "",
            deployment.root ?? "",
        );
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

import type {
    IntegrationConnectorMigrationAdapter,
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { SupabaseConnectorMigrationAdapter } from "../executor";
import { SupabaseFunctionMigrationHandler } from "../functions";
import {
    type ConfiguredSupabaseMigrationServicesConfig,
    redactSupabaseAccessToken,
    resolveSupabaseMigrationConfig,
} from "./config";

export class ConfiguredSupabaseConnectorMigrationAdapter implements IntegrationConnectorMigrationAdapter {
    readonly provider = "supabase";

    constructor(private readonly config: ConfiguredSupabaseMigrationServicesConfig) {}

    async executeDatabasePhase(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
    ) {
        return await this.withAdapter((adapter) => adapter.executeDatabasePhase(context, connector));
    }

    async confirmDatabasePhase(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
    ) {
        return await this.withAdapter((adapter) => adapter.confirmDatabasePhase(context, connector));
    }

    private async withAdapter<T>(operation: (adapter: SupabaseConnectorMigrationAdapter) => Promise<T>): Promise<T> {
        const resolved = await resolveSupabaseMigrationConfig(this.config);
        try {
            return await operation(new SupabaseConnectorMigrationAdapter(resolved));
        } catch (error) {
            throw redactSupabaseAccessToken(error, resolved.accessToken);
        }
    }
}

export class ConfiguredSupabaseFunctionMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    constructor(private readonly config: ConfiguredSupabaseMigrationServicesConfig) {}

    async execute(context: IntegrationMigrationStepContext) {
        return await this.withHandler((handler) => handler.execute(context));
    }

    async confirm(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        return await this.withHandler((handler) => handler.confirm(context, previous));
    }

    private async withHandler<T>(operation: (handler: SupabaseFunctionMigrationHandler) => Promise<T>): Promise<T> {
        const resolved = await resolveSupabaseMigrationConfig(this.config);
        try {
            return await operation(new SupabaseFunctionMigrationHandler(resolved));
        } catch (error) {
            throw redactSupabaseAccessToken(error, resolved.accessToken);
        }
    }
}

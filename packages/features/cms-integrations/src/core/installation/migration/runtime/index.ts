import { IntegrationRuntimeError } from "../../../errors";
import type {
    IntegrationConnectorMigrationAdapter,
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationPhase,
    IntegrationMigrationProbe,
    IntegrationMigrationRuntime,
    IntegrationMigrationStepContext,
    IntegrationMigrationStepResult,
    IntegrationProviderDirectMigrationAdapter,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { DrainMigrationHandler, PointOfNoReturnMigrationHandler, ProbeMigrationHandler } from "./controlPhases";
import { ProviderDirectMigrationHandler } from "./providerDirect";

export type ConfiguredIntegrationMigrationRuntimeOptions = {
    connectorAdapters: IntegrationConnectorMigrationAdapter[];
    phases: Partial<
        Record<Exclude<IntegrationMigrationPhase, "expand" | "contract">, IntegrationMigrationExternalPhaseHandler>
    >;
};

export type ProductionIntegrationMigrationRuntimeOptions = {
    connectorAdapters: IntegrationConnectorMigrationAdapter[];
    functionDeployment: IntegrationMigrationExternalPhaseHandler;
    targetSmoke: IntegrationMigrationProbe;
    cmsBinding: IntegrationMigrationExternalPhaseHandler;
    cmsSmoke: IntegrationMigrationProbe;
    providerDirectAdapters?: IntegrationProviderDirectMigrationAdapter[];
    clock?: { now(): Date };
};

export class ConfiguredIntegrationMigrationRuntime implements IntegrationMigrationRuntime {
    private readonly adapters: Map<string, IntegrationConnectorMigrationAdapter>;

    constructor(private readonly options: ConfiguredIntegrationMigrationRuntimeOptions) {
        this.adapters = new Map(options.connectorAdapters.map((adapter) => [adapter.provider, adapter]));
    }

    async executeStep(context: IntegrationMigrationStepContext): Promise<IntegrationMigrationStepResult> {
        if (context.phase === "expand" || context.phase === "contract") {
            const operations = [];
            for (const connector of context.connectors) {
                const adapter = this.adapters.get(connector.provider);
                if (!adapter) {
                    throw new IntegrationRuntimeError(`migration adapter "${connector.provider}" is not configured`);
                }
                operations.push(await adapter.executeDatabasePhase(context, connector));
            }
            return {
                confirmationDigest: context.targetDigest,
                externalOperationId: joinedOperationIds(operations),
            };
        }
        const result = await this.requiredHandler(context).execute(context);
        return { ...result, confirmationDigest: context.targetDigest };
    }

    async confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        if (context.phase === "expand" || context.phase === "contract") {
            for (const connector of context.connectors) {
                const adapter = this.adapters.get(connector.provider);
                if (!adapter || !(await adapter.confirmDatabasePhase(context, connector))) {
                    return { confirmed: false };
                }
            }
            return {
                confirmed: true,
                confirmationDigest: context.targetDigest,
                ...(previous.externalOperationId ? { externalOperationId: previous.externalOperationId } : {}),
            };
        }
        const confirmation = await this.requiredHandler(context).confirm(context, previous);
        return {
            ...confirmation,
            ...(confirmation.confirmed ? { confirmationDigest: context.targetDigest } : {}),
            ...(confirmation.externalOperationId || previous.externalOperationId
                ? { externalOperationId: confirmation.externalOperationId ?? previous.externalOperationId }
                : {}),
        };
    }

    private requiredHandler(context: IntegrationMigrationStepContext): IntegrationMigrationExternalPhaseHandler {
        const handler = this.options.phases[context.phase as Exclude<IntegrationMigrationPhase, "expand" | "contract">];
        if (!handler) {
            throw new IntegrationRuntimeError(`migration phase handler "${context.phase}" is not configured`);
        }
        return handler;
    }
}

export class ProductionIntegrationMigrationRuntime extends ConfiguredIntegrationMigrationRuntime {
    constructor(options: ProductionIntegrationMigrationRuntimeOptions) {
        const clock = options.clock ?? { now: () => new Date() };
        super({
            connectorAdapters: options.connectorAdapters,
            phases: {
                "deploy-functions": options.functionDeployment,
                "smoke-target": new ProbeMigrationHandler("smoke-target", options.targetSmoke),
                "provider-direct-transition": new ProviderDirectMigrationHandler(options.providerDirectAdapters ?? []),
                "switch-cms-binding": options.cmsBinding,
                "smoke-cms": new ProbeMigrationHandler("smoke-cms", options.cmsSmoke),
                drain: new DrainMigrationHandler(clock),
                "point-of-no-return": new PointOfNoReturnMigrationHandler(),
            },
        });
    }
}

function joinedOperationIds(values: Array<{ externalOperationId?: string }>): string | undefined {
    const ids = values.flatMap((value) => (value.externalOperationId ? [value.externalOperationId] : []));
    return ids.length ? ids.join(",") : undefined;
}

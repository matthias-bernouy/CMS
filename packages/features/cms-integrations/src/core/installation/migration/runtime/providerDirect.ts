import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { IntegrationRuntimeError } from "../../../errors";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepContext,
    IntegrationProviderDirectMigrationAdapter,
} from "../../../../interfaces/IntegrationConnectorDeployer";

export class ProviderDirectMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    private readonly adapters: Map<string, IntegrationProviderDirectMigrationAdapter>;

    constructor(adapters: IntegrationProviderDirectMigrationAdapter[]) {
        this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
    }

    async execute(context: IntegrationMigrationStepContext) {
        assertPhase(context);
        const operations: Array<Record<string, unknown>> = [];
        for (const connector of context.connectors) {
            const cutover = connector.plan.providerDirect;
            if (!cutover) {
                continue;
            }
            if (cutover.strategy === "expand-in-code") {
                operations.push({
                    connectorKey: connector.connectorKey,
                    strategy: cutover.strategy,
                    callbackIds: [...cutover.callbackIds].sort(),
                });
                continue;
            }
            const adapter = this.adapters.get(connector.provider);
            if (!adapter) {
                throw new IntegrationRuntimeError(
                    `provider-direct migration adapter "${connector.provider}" is not configured`,
                );
            }
            const result = await adapter.executeTransition(context, connector, cutover);
            operations.push({
                connectorKey: connector.connectorKey,
                strategy: cutover.strategy,
                callbackIds: [...cutover.callbackIds].sort(),
                externalOperationId: result.externalOperationId ?? null,
            });
        }
        return { externalOperationId: encodeOperations(operations) };
    }

    async confirm(context: IntegrationMigrationStepContext, previous: { externalOperationId?: string }) {
        assertPhase(context);
        for (const connector of context.connectors) {
            const cutover = connector.plan.providerDirect;
            if (!cutover || cutover.strategy === "expand-in-code") {
                continue;
            }
            const adapter = this.adapters.get(connector.provider);
            if (!adapter || !(await adapter.confirmTransition(context, connector, cutover, previous))) {
                return { confirmed: false };
            }
        }
        return { confirmed: true, externalOperationId: previous.externalOperationId ?? encodeOperations([]) };
    }
}

function assertPhase(context: IntegrationMigrationStepContext): void {
    if (context.phase !== "provider-direct-transition") {
        throw new IntegrationRuntimeError(`provider-direct handler cannot execute phase "${context.phase}"`);
    }
    const functions = context.operation.journal.find((entry) => entry.phase === "deploy-functions");
    if (functions?.status !== "succeeded") {
        throw new IntegrationRuntimeError("provider-direct transition requires confirmed target Functions");
    }
}

function encodeOperations(operations: Array<Record<string, unknown>>): string {
    const value = Buffer.from(
        canonicalJsonBytes({ schema: "cms.integration.provider-direct-receipt.v1", operations }),
    ).toString("base64url");
    return `provider-direct:${value}`;
}

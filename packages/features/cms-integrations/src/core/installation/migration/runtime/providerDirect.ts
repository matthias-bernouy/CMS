import { IntegrationRuntimeError } from "../../../errors";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepContext,
    IntegrationProviderDirectMigrationAdapter,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import {
    decodeProviderDirectReceipt,
    encodeProviderDirectReceipt,
    type ProviderDirectReceiptOperation,
} from "./providerDirectReceipt";

export class ProviderDirectMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    private readonly adapters: Map<string, IntegrationProviderDirectMigrationAdapter>;

    constructor(adapters: IntegrationProviderDirectMigrationAdapter[]) {
        this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
    }

    async execute(context: IntegrationMigrationStepContext) {
        assertPhase(context);
        const operations: ProviderDirectReceiptOperation[] = [];
        for (const connector of providerDirectConnectors(context)) {
            const cutover = connector.plan.providerDirect;
            if (!cutover) {
                throw new IntegrationRuntimeError("provider-direct connector plan disappeared during execution");
            }
            if (cutover.strategy === "expand-in-code") {
                operations.push({
                    connectorKey: connector.connectorKey,
                    strategy: cutover.strategy,
                    callbackIds: [...cutover.callbackIds].sort(),
                    externalOperationId: null,
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
            const externalOperationId = result.externalOperationId;
            if (!externalOperationId || externalOperationId.trim() !== externalOperationId) {
                throw new IntegrationRuntimeError(
                    `provider-direct migration adapter "${connector.provider}" returned no durable operation id`,
                );
            }
            operations.push({
                connectorKey: connector.connectorKey,
                strategy: cutover.strategy,
                callbackIds: [...cutover.callbackIds].sort(),
                externalOperationId,
            });
        }
        return { externalOperationId: encodeProviderDirectReceipt(operations) };
    }

    async confirm(context: IntegrationMigrationStepContext, previous: { externalOperationId?: string }) {
        assertPhase(context);
        const operations = decodeProviderDirectReceipt(previous.externalOperationId);
        const connectors = providerDirectConnectors(context);
        if (!operations || !samePlannedOperations(connectors, operations)) {
            return { confirmed: false };
        }
        for (const connector of connectors) {
            const cutover = connector.plan.providerDirect;
            const operation = operations.find((entry) => entry.connectorKey === connector.connectorKey);
            if (!cutover || !operation) {
                return { confirmed: false };
            }
            if (cutover.strategy === "expand-in-code") {
                continue;
            }
            const adapter = this.adapters.get(connector.provider);
            if (
                !adapter ||
                !(await adapter.confirmTransition(context, connector, cutover, {
                    externalOperationId: operation.externalOperationId ?? undefined,
                }))
            ) {
                return { confirmed: false };
            }
        }
        return { confirmed: true, externalOperationId: previous.externalOperationId };
    }
}

function providerDirectConnectors(context: IntegrationMigrationStepContext) {
    return context.connectors
        .filter((connector) => connector.plan.providerDirect !== undefined)
        .toSorted((left, right) =>
            left.connectorKey < right.connectorKey ? -1 : left.connectorKey > right.connectorKey ? 1 : 0,
        );
}

function samePlannedOperations(
    connectors: ReturnType<typeof providerDirectConnectors>,
    operations: readonly ProviderDirectReceiptOperation[],
): boolean {
    if (connectors.length !== operations.length) {
        return false;
    }
    return connectors.every((connector, index) => {
        const planned = connector.plan.providerDirect;
        const observed = operations[index];
        const callbacks = [...(planned?.callbackIds ?? [])].sort();
        return (
            observed?.connectorKey === connector.connectorKey &&
            observed.strategy === planned?.strategy &&
            observed.callbackIds.length === callbacks.length &&
            observed.callbackIds.every((callback, callbackIndex) => callback === callbacks[callbackIndex])
        );
    });
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

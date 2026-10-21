import type { ProviderOperationExecutor } from "../../operations/ProviderOperationExecutor";
import type { ProviderOperationRecord } from "../../operations/types";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";

const CONTRACT_ID = "ulvia.cms.collections";

export function registerCollectionOperationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    operations?: ProviderOperationExecutor,
): void {
    dispatcher.register(CONTRACT_ID, "list-operations", async (input, context) => {
        if (!operations) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 20;
        const page = await operations.store.list(
            context.siteId,
            CONTRACT_ID,
            typeof input.cursor === "string" ? input.cursor : undefined,
            limit,
        );
        return {
            items: page.items.map((operation) => projectOperation(operation, false)),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
    });
    dispatcher.register(CONTRACT_ID, "get-operation", async (input, context) => {
        if (!operations) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        if (typeof input.operationId !== "string") {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const operation = await operations.store.get(context.siteId, input.operationId);
        if (!operation || operation.contractId !== CONTRACT_ID) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectOperation(operation, true);
    });
}

function projectOperation(operation: ProviderOperationRecord, detailed: boolean) {
    return {
        operationId: operation.id,
        capabilityId: operation.capabilityId,
        status: operation.status,
        revision: operation.revision,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
        ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
        ...(detailed && operation.result !== undefined ? { result: structuredClone(operation.result) } : {}),
    };
}

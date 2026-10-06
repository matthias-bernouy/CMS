import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "../dispatch/registry";
import type { CoreOperationExecutor } from "../operations/CoreOperationExecutor";

export function registerJobCapabilities(dispatcher: CoreCapabilityRegistry, operations?: CoreOperationExecutor): void {
    dispatcher.register("ulvia.cms.jobs", "list", async (input, context) => {
        if (!operations) {
            throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 20;
        const page = await operations.store.list(
            context.siteId,
            typeof input.cursor === "string" ? input.cursor : undefined,
            limit,
        );
        return {
            items: page.items.map((operation) => projectJob(operation, false)),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
    });
    dispatcher.register("ulvia.cms.jobs", "get", async (input, context) => {
        if (!operations || typeof input.jobId !== "string") {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const operation = await operations.store.get(context.siteId, input.jobId);
        if (!operation) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectJob(operation, true);
    });
}

function projectJob(operation: Awaited<ReturnType<CoreOperationExecutor["store"]["get"]>> & object, detailed: boolean) {
    return {
        id: operation.id,
        contractId: operation.contractId,
        capabilityId: operation.capabilityId,
        status: operation.status,
        revision: operation.revision,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
        ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
        ...(detailed && operation.result !== undefined ? { resultJson: JSON.stringify(operation.result) } : {}),
    };
}

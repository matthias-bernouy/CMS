import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CmsCoreCapabilityStores } from "./dependencies";
import type { CoreOperationExecutor } from "../operations/CoreOperationExecutor";

export function registerOperationCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsCoreCapabilityStores,
    operations?: CoreOperationExecutor,
): void {
    dispatcher.register("ulvia.cms.operations", "status", async (input, context) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 20;
        const [active, audits] = await Promise.all([
            core.collectionMigrations.getActive(context.siteId),
            core.collectionMigrations.listAudits(context.siteId, limit),
        ]);
        return {
            core: "ready",
            maintenance: active !== null,
            ...(active
                ? { activeMigration: { id: active.id, status: active.status, updatedAt: active.updatedAt } }
                : {}),
            migrations: audits.map(({ id, status, createdAt, updatedAt, totalPages, operationCount }) => ({
                id,
                status,
                createdAt,
                updatedAt,
                totalPages,
                operationCount,
            })),
        };
    });
    dispatcher.register("ulvia.cms.operations", "list", async (input, context) => {
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
            items: page.items.map((operation) => projectOperation(operation, false)),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
    });
    dispatcher.register("ulvia.cms.operations", "get", async (input, context) => {
        if (!operations || typeof input.operationId !== "string") {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const operation = await operations.store.get(context.siteId, input.operationId);
        if (!operation) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectOperation(operation, true);
    });
}

function projectOperation(
    operation: Awaited<ReturnType<CoreOperationExecutor["store"]["get"]>> & object,
    detailed: boolean,
) {
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

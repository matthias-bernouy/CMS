import { capabilityResponse } from "@bernouy/ulvia-sdk";
import { installationsFeature } from "@bernouy/cms-repository/features/installations";
import type { InstallationOperationQueries } from "@bernouy/cms-repository/features/installations";
import type { ProviderOperationExecutor } from "../../../../operations/ProviderOperationExecutor";
import type { ProviderOperationRecord } from "../../../../operations/types";
import { operationLanguage, operationMessage } from "../../../../operations/messages";
import { ProviderCapabilityDispatchError } from "../../../../dispatch/registry";
const CONTRACT_ID = installationsFeature.contractId;
const detailSchema = installationsFeature.capabilities.find((capability) => capability.id === "get-operation")!.output;
const pageSchema = installationsFeature.capabilities.find((capability) => capability.id === "list-operations")!.output;
/** Validate persisted read projections, not business executors or authored schemas at startup. */
export function createInstallationOperationQueries(
    operations: Pick<ProviderOperationExecutor, "store">,
): InstallationOperationQueries {
    const store = operations.store;
    return {
        async list(siteId, input) {
            const page = await store.list(siteId, CONTRACT_ID, input.cursor, input.limit ?? 20);
            return pageSchema.parse({
                items: page.items.map((operation) => projectOperation(operation, false)),
                ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
            });
        },
        async get(siteId, operationId) {
            const operation = await store.get(siteId, operationId);
            if (!operation || operation.contractId !== CONTRACT_ID) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            const detail = detailSchema.parse(projectOperation(operation, true));
            return operation.status === "failed"
                ? capabilityResponse(detail, undefined, { contentLanguage: operationLanguage(operation) })
                : detail;
        },
    };
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
        ...(detailed && operation.errorCode ? { errorOutput: operationMessage(operation) } : {}),
        ...(detailed && operation.result !== undefined ? { result: structuredClone(operation.result) } : {}),
    };
}

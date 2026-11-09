import type { AuthoringServices } from "@bernouy/repository/features/authoring";
import type { RepositoryServices } from "@bernouy/repository/features/repository";
import { RepositoryRequestError } from "@bernouy/repository/repository/publication";
import type { ProviderOperationExecutor } from "../../../operations/ProviderOperationExecutor";

/** Project only the requesting actor's exact publication; never expose persisted inputs or worker context. */
export function createRepositoryOperationQueries(
    operations: Pick<ProviderOperationExecutor, "store">,
): NonNullable<RepositoryServices["repositoryOperations"]> {
    return {
        async get(siteId, input, actor) {
            const record = await operations.store.get(siteId, input.operationId);
            if (
                !record ||
                record.contractId !== "ulvia/repository" ||
                record.capabilityId !== "publication-build" ||
                record.context.providerId !== actor.providerId ||
                record.context.subjectId !== actor.subjectId ||
                record.input.namespace !== input.namespace ||
                record.input.namespaceRevision !== input.namespaceRevision ||
                record.input.uploadId !== input.uploadId
            ) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return {
                operationId: record.id,
                status: record.status,
                ...(record.status === "succeeded" ? { result: record.result } : {}),
                ...(record.errorCode ? { errorCode: record.errorCode, errorOutput: record.errorOutput } : {}),
            };
        },
    };
}

export function createAuthoringOperationQueries(
    operations: Pick<ProviderOperationExecutor, "store">,
): NonNullable<AuthoringServices["authoringOperations"]> {
    return {
        async get(siteId, input, actor) {
            const record = await operations.store.get(siteId, input.operationId);
            if (
                !record ||
                record.contractId !== "ulvia/cms.authoring" ||
                record.capabilityId !== "publish-collection-operation" ||
                record.context.providerId !== actor.providerId ||
                record.context.subjectId !== actor.subjectId ||
                record.input.preparationId !== input.preparationId ||
                record.input.expectedDigest !== input.expectedDigest
            ) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return {
                operationId: record.id,
                status: record.status,
                ...(record.status === "succeeded" ? { result: record.result } : {}),
                ...(record.errorCode ? { errorCode: record.errorCode, errorOutput: record.errorOutput } : {}),
            };
        },
    };
}

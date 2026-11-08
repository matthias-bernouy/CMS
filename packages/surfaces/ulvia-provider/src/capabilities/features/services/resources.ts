import type { ResourceServices } from "@bernouy/resources/feature";
import type { ProviderOperationExecutor } from "../../../operations/ProviderOperationExecutor";

/** One scoped metadata query, after the feature has checked current human administrator authority. */
export function createResourceOperationQuery(
    operations: Pick<ProviderOperationExecutor, "store">,
): ResourceServices["resources"]["operation"] {
    return async (siteId, contractId) => {
        const operation = await operations.store.latest(siteId, contractId, "initialization.apply");
        // Persisted error details are not a second source of public messages or private causes.
        return {
            operationId: operation?.id ?? "",
            operationStatus: operation?.status ?? "none",
            errorMessage: operation?.status === "failed" ? "Setup stopped. Refresh its status and resume." : "",
        };
    };
}

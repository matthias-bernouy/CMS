import type { ProviderCapabilityResponse } from "@bernouy/ulvia-sdk";
import type { GetOperationOutput, ListOperationsOutput } from "repository/application/installations/interfaces/outputs";
import type { ListOperationsInput } from "repository/application/installations/interfaces/inputs";
/** The host owns durable storage and localizes persisted failures before returning this read view. */
export interface InstallationOperationQueries {
    get(
        siteId: string,
        operationId: string,
    ): Promise<GetOperationOutput | ProviderCapabilityResponse<GetOperationOutput>>;
    list(siteId: string, input: ListOperationsInput): Promise<ListOperationsOutput>;
}

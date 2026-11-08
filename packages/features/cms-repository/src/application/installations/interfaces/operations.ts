import type {
    GetOperationOutput,
    ListOperationsOutput,
} from "cms-repository/application/installations/interfaces/outputs";
import type { ListOperationsInput } from "cms-repository/application/installations/interfaces/inputs";
/** The host owns durable storage and localizes persisted failures before returning this read view. */
export interface InstallationOperationQueries {
    get(siteId: string, operationId: string): Promise<GetOperationOutput>;
    list(siteId: string, input: ListOperationsInput): Promise<ListOperationsOutput>;
}

import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { OperationSource } from "ulvia-sdk/interfaces/operations";
import type { ContractDefinition } from "ulvia-sdk/interfaces/contracts";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function ownOperations(source: ContractDefinition): OperationSource[] {
    if (!Array.isArray(source.operations) || source.operations.length > DEFAULT_RELEASE_LIMITS.maxCapabilities) {
        throw new SdkDefinitionError("Contract operations must be a bounded list", "$.operations");
    }
    const operations = [...source.operations];
    const ids = new Set<string>();
    for (const operation of operations) {
        if (!operation || typeof operation.id !== "string" || ids.has(operation.id)) {
            throw new SdkDefinitionError("Missing or duplicate operation ID", "$.operations");
        }
        ids.add(operation.id);
    }
    return operations;
}

import type { ContractRelease } from "@bernouy/ulvia-contracts";
import type { OperationSource } from "ulvia-sdk/interfaces/operations";

export interface ContractFixtureSource {
    readonly id: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array | Blob;
}

export type ContractOperations<Operations extends readonly OperationSource[]> = {
    readonly [Operation in Operations[number] as Operation["id"]]: Operation;
};

export interface ContractDefinition<Operations extends readonly OperationSource[] = readonly OperationSource[]>
    extends Pick<ContractRelease, "contractId" | "name" | "publisherId" | "version" | "description" | "catalogue"> {
    /** Only operations introduced by this release; inherited operations stay in their parent. */
    readonly operations: Operations;
    readonly extends?: ContractDefinition;
    /** Markdown sources, or a file URL to a directory scanned recursively during compilation. */
    readonly documents?: Readonly<Record<string, string>> | URL;
    readonly fixtures?: readonly ContractFixtureSource[];
}

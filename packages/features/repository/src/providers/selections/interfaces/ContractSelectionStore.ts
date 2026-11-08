import type {
    CapabilityGrantPolicy,
    ContractSelectionReader,
    StoredContractSelections,
} from "@bernouy/ulvia-providers/selections";

export interface ContractSelectionStore extends ContractSelectionReader {
    /** Revalidates the entire proposed site graph. Zero is the revision of an absent site. */
    replace(
        siteId: string,
        selections: unknown,
        expectedRevision: number,
        grants?: CapabilityGrantPolicy,
    ): Promise<StoredContractSelections>;
}

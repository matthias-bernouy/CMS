import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type {
    ContractReleaseReader,
    CatalogueContractRelease,
    ContractReleaseDeprecation,
    ContractReleaseYank,
} from "@bernouy/ulvia-contracts/catalogue";

export interface ReleaseCatalogue extends ContractReleaseReader {
    /** Reverify admission and resolve mandatory capability requirements before accepting a release. */
    publish(admission: AdmittedContractRelease): Promise<CatalogueContractRelease>;
    setDeprecation(
        contractId: string,
        version: string,
        deprecation: ContractReleaseDeprecation | null,
    ): Promise<CatalogueContractRelease>;
    setYank(contractId: string, version: string, yank: ContractReleaseYank | null): Promise<CatalogueContractRelease>;
}

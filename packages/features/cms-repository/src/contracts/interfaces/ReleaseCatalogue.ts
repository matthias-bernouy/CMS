import type { ReleaseDigest } from "../core/admission/digest";
import type { AdmittedContractRelease } from "../core/admission/admitContractRelease";

export interface ContractReleaseDeprecation {
    readonly reason?: string;
    readonly replacedByVersion?: string;
    readonly sunsetAt?: string;
}

export interface ContractReleaseYank {
    readonly reason: string;
}

export interface CatalogueContractRelease {
    readonly admission: AdmittedContractRelease;
    /** Catalogue acceptance time; it is not part of the release digest. */
    readonly publishedAt: string;
    readonly deprecation?: ContractReleaseDeprecation;
    readonly yank?: ContractReleaseYank;
}

export interface ReleaseCatalogue {
    findByDigest(digest: ReleaseDigest): Promise<CatalogueContractRelease | null>;
    get(contractId: string, version: string): Promise<CatalogueContractRelease | null>;
    list(contractId?: string): Promise<readonly CatalogueContractRelease[]>;
    /** Reverify admission and resolve mandatory capability requirements before accepting a release. */
    publish(admission: AdmittedContractRelease): Promise<CatalogueContractRelease>;
    setDeprecation(
        contractId: string,
        version: string,
        deprecation: ContractReleaseDeprecation | null,
    ): Promise<CatalogueContractRelease>;
    setYank(contractId: string, version: string, yank: ContractReleaseYank | null): Promise<CatalogueContractRelease>;
}

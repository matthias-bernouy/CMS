import type { ReleaseDigest } from "ulvia-contracts/core/admission/digest";
import type { AdmittedContractRelease } from "ulvia-contracts/core/admission/admitContractRelease";

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

export interface ContractReleaseReader {
    readDocumentation?(digest: ReleaseDigest, path: string): Promise<Blob | null>;
    /** Optional token that changes on every publication, yank or deprecation mutation. */
    revision?(): Promise<string>;
    findByDigest(digest: ReleaseDigest): Promise<CatalogueContractRelease | null>;
    get(contractId: string, version: string): Promise<CatalogueContractRelease | null>;
    list(contractId?: string): Promise<readonly CatalogueContractRelease[]>;
}

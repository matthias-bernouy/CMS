import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { CatalogueContractRelease, ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";

/** Synthetic read metadata for compilation, never emitted as a publication receipt. */
export function buildCatalogue(releases: readonly AdmittedContractRelease[]): ContractReleaseReader {
    const rows: CatalogueContractRelease[] = releases.map((admission) => ({
        admission,
        publishedAt: "1970-01-01T00:00:00Z",
    }));
    const coordinates = new Map(
        rows.map((row) => [`${row.admission.release.contractId}@${row.admission.release.version}`, row]),
    );
    const digests = new Map(rows.map((row) => [row.admission.digest, row]));
    return {
        get: async (id, version) => coordinates.get(`${id}@${version}`) ?? null,
        findByDigest: async (digest) => digests.get(digest) ?? null,
        list: async (id) => rows.filter((row) => !id || row.admission.release.contractId === id),
    };
}

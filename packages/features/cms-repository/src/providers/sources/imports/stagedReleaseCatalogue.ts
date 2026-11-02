import type { AdmittedContractRelease } from "cms-repository/exports/contracts";
import type {
    CatalogueContractRelease,
    ContractReleaseDeprecation,
    ContractReleaseYank,
    ReleaseCatalogue,
} from "cms-repository/exports/contracts/catalogue";

const STAGED_AT = "1970-01-01T00:00:00.000Z";

/** Read-only overlay used to validate a provider and all fetched contracts before publication. */
export function stagedReleaseCatalogue(
    base: ReleaseCatalogue,
    admissions: readonly AdmittedContractRelease[],
): ReleaseCatalogue {
    const records = admissions.map(
        (admission): CatalogueContractRelease => Object.freeze({ admission, publishedAt: STAGED_AT }),
    );
    const byKey = new Map(records.map((record) => [key(record), record]));
    return {
        async get(contractId, version) {
            return byKey.get(`${contractId}\u0000${version}`) ?? base.get(contractId, version);
        },
        async findByDigest(digest) {
            return records.find((record) => record.admission.digest === digest) ?? base.findByDigest(digest);
        },
        async list(contractId) {
            const merged = new Map((await base.list(contractId)).map((record) => [key(record), record]));
            for (const record of records) {
                if (contractId === undefined || record.admission.release.contractId === contractId) {
                    merged.set(key(record), record);
                }
            }
            return Object.freeze([...merged.values()]);
        },
        publish: readOnly,
        setDeprecation: readOnlyDeprecation,
        setYank: readOnlyYank,
    };
}

function key(record: CatalogueContractRelease): string {
    return `${record.admission.release.contractId}\u0000${record.admission.release.version}`;
}

async function readOnly(_admission: AdmittedContractRelease): Promise<CatalogueContractRelease> {
    throw new TypeError("Staged release catalogue is read-only");
}

async function readOnlyDeprecation(
    _contractId: string,
    _version: string,
    _deprecation: ContractReleaseDeprecation | null,
): Promise<CatalogueContractRelease> {
    throw new TypeError("Staged release catalogue is read-only");
}

async function readOnlyYank(
    _contractId: string,
    _version: string,
    _yank: ContractReleaseYank | null,
): Promise<CatalogueContractRelease> {
    throw new TypeError("Staged release catalogue is read-only");
}

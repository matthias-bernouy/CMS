import type { Collection } from "mongodb";
import type { AdmittedContractRelease } from "../../core/admission/admitContractRelease";
import type { ReleaseDigest } from "../../core/admission/digest";
import { verifyAdmission } from "../../core/admission/verifyAdmission";
import type { ReleaseLimits } from "../../core/protocol/limits";
import { ReleaseValidationError } from "../../core/protocol/errors";
import { deepFreeze } from "../../core/protocol/values";
import type {
    CatalogueContractRelease,
    ContractReleaseDeprecation,
    ContractReleaseYank,
} from "../../interfaces/ReleaseCatalogue";

export interface ReleaseVersionEntry {
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly publishedAt: string;
    readonly deprecation?: ContractReleaseDeprecation;
    readonly yank?: ContractReleaseYank;
}

export interface ReleaseHead {
    readonly _id: string;
    readonly revision: number;
    readonly publisherId: string;
    readonly versions: readonly ReleaseVersionEntry[];
}

export interface ReleaseArtifact {
    readonly _id: ReleaseDigest;
    readonly admission: AdmittedContractRelease;
}

export async function releaseRecord(
    artifact: ReleaseArtifact | null,
    entry: ReleaseVersionEntry,
    limits: Readonly<ReleaseLimits>,
): Promise<CatalogueContractRelease> {
    if (!artifact || artifact._id !== entry.digest) {
        throw new ReleaseValidationError("invalid_contract", "published release artifact is missing");
    }
    const admission = await verifyAdmission(artifact.admission, limits);
    if (admission.digest !== entry.digest || admission.release.version !== entry.version) {
        throw new ReleaseValidationError("invalid_contract", "published release artifact disagrees with catalogue");
    }
    return deepFreeze({
        admission,
        publishedAt: entry.publishedAt,
        ...(entry.deprecation ? { deprecation: entry.deprecation } : {}),
        ...(entry.yank ? { yank: entry.yank } : {}),
    });
}

export async function recordsForHead(
    head: ReleaseHead,
    artifacts: Collection<ReleaseArtifact>,
    limits: Readonly<ReleaseLimits>,
): Promise<readonly CatalogueContractRelease[]> {
    if (!Number.isSafeInteger(head.revision) || head.revision < 1 || head.versions.length > 2048) {
        throw new ReleaseValidationError("invalid_contract", "published release index is invalid");
    }
    return Promise.all(
        head.versions.map(async (entry) => {
            const record = await releaseRecord(await artifacts.findOne({ _id: entry.digest }), entry, limits);
            if (
                record.admission.release.contractId !== head._id ||
                record.admission.release.publisherId !== head.publisherId
            ) {
                throw new ReleaseValidationError("invalid_contract", "published release index disagrees with artifact");
            }
            return record;
        }),
    );
}

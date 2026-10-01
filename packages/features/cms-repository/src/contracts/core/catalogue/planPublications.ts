import type { AdmittedContractRelease } from "../admission/admitContractRelease";
import { verifyAdmission } from "../admission/verifyAdmission";
import { compareSemVer } from "../compatibility/semver";
import { ReleaseValidationError } from "../protocol/errors";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import type { CatalogueContractRelease, ReleaseCatalogue } from "../../interfaces/ReleaseCatalogue";
import { verifyEvolution } from "./verifyEvolution";
import { verifyRequirements } from "./verifyRequirements";

const PLANNED_AT = "1970-01-01T00:00:00.000Z";

/** Validates a complete publication set and returns an order that satisfies inter-release requirements. */
export async function planContractPublications(
    catalogue: ReleaseCatalogue,
    admissions: readonly AdmittedContractRelease[],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<readonly AdmittedContractRelease[]> {
    const snapshotLimits = Object.freeze({ ...limits });
    const verified = await Promise.all(admissions.map((admission) => verifyAdmission(admission, snapshotLimits)));
    const published = [...(await catalogue.list())];
    const planned: CatalogueContractRelease[] = [];
    const candidates = [...verified].sort((left, right) => compareSemVer(left.release.version, right.release.version));
    for (const admission of candidates) {
        const { contractId, version, publisherId } = admission.release;
        const existing = [...published, ...planned].find(
            (record) =>
                record.admission.release.contractId === contractId && record.admission.release.version === version,
        );
        if (existing) {
            if (existing.admission.digest !== admission.digest) {
                throw new ReleaseValidationError("invalid_contract", `${contractId}@${version} is already published`);
            }
            continue;
        }
        const digestOwner = [...published, ...planned].find((record) => record.admission.digest === admission.digest);
        if (digestOwner) {
            throw new ReleaseValidationError("invalid_contract", "release digest is already assigned", "$.digest");
        }
        const historical = [...published, ...planned].find(
            (record) => record.admission.release.contractId === contractId,
        );
        if (historical && historical.admission.release.publisherId !== publisherId) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "publisher ownership cannot change between releases",
                "$.publisherId",
            );
        }
        verifyEvolution(admission.release, [...published, ...planned], snapshotLimits);
        planned.push(Object.freeze({ admission, publishedAt: PLANNED_AT }));
    }
    const complete = [...published, ...planned];
    for (const record of planned) {
        verifyRequirements(record.admission.release, complete);
    }
    return orderByRequirements(planned, published);
}

function orderByRequirements(
    planned: readonly CatalogueContractRelease[],
    published: readonly CatalogueContractRelease[],
): readonly AdmittedContractRelease[] {
    const pending = [...planned];
    const available = [...published];
    const ordered: AdmittedContractRelease[] = [];
    while (pending.length > 0) {
        const index = pending.findIndex((record) => {
            try {
                verifyRequirements(record.admission.release, available);
                return true;
            } catch {
                return false;
            }
        });
        if (index === -1) {
            verifyRequirements(pending[0]!.admission.release, available);
            throw new ReleaseValidationError("invalid_contract", "cyclic staged contract requirements");
        }
        const [record] = pending.splice(index, 1);
        available.push(record!);
        ordered.push(record!.admission);
    }
    return Object.freeze(ordered);
}

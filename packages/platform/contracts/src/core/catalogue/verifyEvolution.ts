import type { ContractRelease } from "ulvia-contracts/interfaces/ContractRelease";
import type { CatalogueContractRelease } from "ulvia-contracts/interfaces/ContractReleaseReader";
import type { ReleaseLimits } from "ulvia-contracts/core/protocol/limits";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import { compareContractReleases } from "ulvia-contracts/core/compatibility/compareContractReleases";
import {
    compareSemVer,
    isSemVerPrerelease,
    semVerMajor,
    semVerReleaseTarget,
} from "ulvia-contracts/core/compatibility/semver";

/** Stable compatibility and prerelease ordering are independent publication gates. */
export function verifyEvolution(
    next: ContractRelease,
    published: readonly CatalogueContractRelease[],
    limits: Readonly<ReleaseLimits>,
    ancestry = published,
): void {
    const releases = published
        .map((record) => record.admission.release)
        .filter((release) => release.contractId === next.contractId)
        .sort((left, right) => compareSemVer(right.version, left.version));
    const previousTarget = releases.find(
        (release) => semVerReleaseTarget(release.version) === semVerReleaseTarget(next.version),
    );
    if (previousTarget && compareSemVer(next.version, previousTarget.version) <= 0) {
        throw new ReleaseValidationError("invalid_contract", "next release version must increase");
    }
    const stableReference = releases.find(
        (release) => !isSemVerPrerelease(release.version) && semVerMajor(release.version) === semVerMajor(next.version),
    );
    if (stableReference) {
        const report = compareContractReleases(stableReference, next, limits);
        if (!report.validEvolution) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `incompatible publication: ${report.issues.map((issue) => issue.message).join("; ")}`,
            );
        }
    }
    verifyCapabilityLifecycle(next, published, ancestry, limits);
}

import { verifyCapabilityLifecycle } from "./lifecycle/verify";

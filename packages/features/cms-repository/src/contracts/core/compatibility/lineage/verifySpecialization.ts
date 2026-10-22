import type { ContractRelease } from "cms-repository/contracts/interfaces/ContractRelease";
import type { CatalogueContractRelease } from "cms-repository/contracts/interfaces/ReleaseCatalogue";
import { canonicalizeIJson } from "cms-repository/contracts/core/protocol/canonical";
import { ReleaseValidationError } from "cms-repository/contracts/core/protocol/errors";

/** A specialization is self-contained and may add, but never replace, parent capabilities. */
export function verifySpecialization(release: ContractRelease, published: readonly CatalogueContractRelease[]): void {
    const parentReference = release.extends;
    if (!parentReference) {
        return;
    }
    const parentRecord = published.find(
        ({ admission }) =>
            admission.release.contractId === parentReference.contractId &&
            admission.release.version === parentReference.version,
    );
    if (!parentRecord || parentRecord.admission.digest !== parentReference.digest) {
        throw new ReleaseValidationError(
            "invalid_contract",
            `parent ${parentReference.contractId}@${parentReference.version} with digest ${parentReference.digest} is not published`,
            "$.extends",
        );
    }
    const childCapabilities = new Map(release.capabilities.map((capability) => [capability.id, capability]));
    for (const parentCapability of parentRecord.admission.release.capabilities) {
        const inherited = childCapabilities.get(parentCapability.id);
        if (!inherited) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `specialization must include inherited capability ${parentCapability.id}`,
                "$.capabilities",
            );
        }
        if (canonicalizeIJson(inherited) !== canonicalizeIJson(parentCapability)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `specialization cannot override inherited capability ${parentCapability.id}`,
                "$.capabilities",
            );
        }
    }
}

import type { ContractRelease } from "cms-repository/contracts/interfaces/ContractRelease";
import type { CatalogueContractRelease } from "cms-repository/contracts/interfaces/ReleaseCatalogue";
import { ReleaseValidationError } from "cms-repository/contracts/core/protocol/errors";

/** A specialization declares only additions and inherits its exact ancestors from the catalogue. */
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
    const inheritedIds = new Set<string>();
    let ancestor = parentRecord;
    const visited = new Set<string>();
    while (ancestor) {
        if (visited.has(ancestor.admission.release.contractId)) {
            throw new ReleaseValidationError("invalid_contract", "contract inheritance contains a cycle", "$.extends");
        }
        visited.add(ancestor.admission.release.contractId);
        for (const capability of ancestor.admission.release.capabilities) {
            inheritedIds.add(capability.id);
        }
        const parent = ancestor.admission.release.extends;
        if (!parent) {
            break;
        }
        const next = published.find(
            ({ admission }) =>
                admission.release.contractId === parent.contractId && admission.release.version === parent.version,
        );
        if (!next || next.admission.digest !== parent.digest) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `parent ${parent.contractId}@${parent.version} with digest ${parent.digest} is not published`,
                "$.extends",
            );
        }
        ancestor = next;
    }
    for (const capability of release.capabilities) {
        if (inheritedIds.has(capability.id)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `specialization cannot redeclare inherited capability ${capability.id}`,
                "$.capabilities",
            );
        }
    }
}

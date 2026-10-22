import type { ContractRelease } from "cms-repository/contracts/interfaces/ContractRelease";
import type { ReleaseCatalogue } from "cms-repository/contracts/interfaces/ReleaseCatalogue";
import { ReleaseValidationError } from "cms-repository/contracts/core/protocol/errors";

/** Returns the concrete release first, followed by each exact ancestor up to the root. */
export async function resolveContractLineage(
    catalogue: ReleaseCatalogue,
    concrete: ContractRelease,
): Promise<readonly ContractRelease[]> {
    const lineage = [concrete];
    const visited = new Set([concrete.contractId]);
    let current = concrete;
    while (current.extends) {
        const reference = current.extends;
        if (visited.has(reference.contractId)) {
            throw new ReleaseValidationError("invalid_contract", "contract inheritance contains a cycle", "$.extends");
        }
        const record = await catalogue.get(reference.contractId, reference.version);
        if (!record || record.admission.digest !== reference.digest) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `parent ${reference.contractId}@${reference.version} does not match its pinned digest`,
                "$.extends",
            );
        }
        current = record.admission.release;
        lineage.push(current);
        visited.add(current.contractId);
    }
    return Object.freeze(lineage);
}

export async function findImplementedContract(
    catalogue: ReleaseCatalogue,
    concrete: ContractRelease,
    contractId: string,
): Promise<ContractRelease | null> {
    return (
        (await resolveContractLineage(catalogue, concrete)).find((release) => release.contractId === contractId) ?? null
    );
}

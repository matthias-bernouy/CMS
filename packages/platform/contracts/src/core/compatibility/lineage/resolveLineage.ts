import type { AdmittedContractRelease } from "../../admission/admitContractRelease";
import type { ResolvedContract } from "../../../interfaces/ResolvedContract";
import type { CapabilityDefinition, ContractRelease } from "ulvia-contracts/interfaces/ContractRelease";
import type { ContractReleaseReader } from "ulvia-contracts/interfaces/ContractReleaseReader";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import { validateDeprecationReferences } from "../../parsing/parseDeprecation";

/** Returns the concrete release first, followed by each exact ancestor up to the root. */
export async function resolveContractLineage(
    catalogue: ContractReleaseReader,
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
    validateDeprecationReferences(effectiveLineageCapabilities(lineage));
    return Object.freeze(lineage);
}

export async function findImplementedContract(
    catalogue: ContractReleaseReader,
    concrete: ContractRelease,
    contractId: string,
): Promise<ContractRelease | null> {
    return (
        (await resolveContractLineage(catalogue, concrete)).find((release) => release.contractId === contractId) ?? null
    );
}

/** Resolves the effective capability set in declaration order, from root to concrete additions. */
export function effectiveLineageCapabilities(lineage: readonly ContractRelease[]): readonly CapabilityDefinition[] {
    return Object.freeze(lineage.toReversed().flatMap((release) => release.capabilities));
}

/** Preserve published bytes and ownership while resolving the effective execution surface. */
export async function resolveContract(
    catalogue: ContractReleaseReader,
    admission: AdmittedContractRelease,
): Promise<ResolvedContract> {
    const releases = await resolveContractLineage(catalogue, admission.release);
    const lineage = releases.map((release, index) =>
        Object.freeze({
            release,
            digest: index === 0 ? admission.digest : releases[index - 1]!.extends!.digest,
        }),
    );
    const capabilities = lineage.toReversed().flatMap(({ release, digest }) =>
        release.capabilities.map((definition) =>
            Object.freeze({
                owner: Object.freeze({ contractId: release.contractId, version: release.version, digest }),
                definition,
            }),
        ),
    );
    return Object.freeze({
        release: admission.release,
        digest: admission.digest,
        lineage: Object.freeze(lineage),
        capabilities: Object.freeze(capabilities),
    });
}

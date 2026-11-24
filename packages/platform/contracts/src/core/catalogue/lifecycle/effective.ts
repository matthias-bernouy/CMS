import type { ContractEventDefinition } from "ulvia-contracts/interfaces/ContractEvent";
import type { CapabilityDefinition, ContractRelease } from "../../../interfaces/ContractRelease";
import type { AdmittedContractRelease } from "../../admission/admitContractRelease";
import { ReleaseValidationError } from "../../protocol/errors";

/** Compare execution views: moving an exact parent must not hide inherited changes. */
export function effectiveCapabilities(
    release: ContractRelease,
    index: ReadonlyMap<string, AdmittedContractRelease>,
): ReadonlyMap<string, CapabilityDefinition> {
    return effectiveDefinitions(release, index, (entry) => entry.capabilities);
}

export function effectiveEvents(
    release: ContractRelease,
    index: ReadonlyMap<string, AdmittedContractRelease>,
): ReadonlyMap<string, ContractEventDefinition> {
    return effectiveDefinitions(release, index, (entry) => entry.events ?? []);
}

function effectiveDefinitions<Definition extends { readonly id: string }>(
    release: ContractRelease,
    index: ReadonlyMap<string, AdmittedContractRelease>,
    own: (release: ContractRelease) => readonly Definition[],
): ReadonlyMap<string, Definition> {
    const capabilities = new Map<string, Definition>();
    const visited = new Set<string>();
    let current = release;
    for (;;) {
        if (visited.has(current.contractId)) {
            throw new ReleaseValidationError("invalid_contract", "contract inheritance contains a cycle", "$.extends");
        }
        visited.add(current.contractId);
        for (const capability of own(current)) {
            if (capabilities.has(capability.id)) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "specialization redeclares an inherited definition",
                );
            }
            capabilities.set(capability.id, capability);
        }
        if (!current.extends) {
            return capabilities;
        }
        const parent = index.get(`${current.extends.contractId}@${current.extends.version}`);
        if (!parent || parent.digest !== current.extends.digest) {
            throw new ReleaseValidationError("invalid_contract", "exact parent is unavailable", "$.extends");
        }
        current = parent.release;
    }
}

import type { CapabilityDefinition, ContractRelease } from "../../../interfaces/ContractRelease";
import type { AdmittedContractRelease } from "../../admission/admitContractRelease";
import { ReleaseValidationError } from "../../protocol/errors";

/** Compare execution views: moving an exact parent must not hide inherited changes. */
export function effectiveCapabilities(
    release: ContractRelease,
    index: ReadonlyMap<string, AdmittedContractRelease>,
): ReadonlyMap<string, CapabilityDefinition> {
    const capabilities = new Map<string, CapabilityDefinition>();
    const visited = new Set<string>();
    let current = release;
    for (;;) {
        if (visited.has(current.contractId)) {
            throw new ReleaseValidationError("invalid_contract", "contract inheritance contains a cycle", "$.extends");
        }
        visited.add(current.contractId);
        for (const capability of current.capabilities) {
            if (capabilities.has(capability.id)) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "specialization redeclares an inherited capability",
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

import { parseCapabilityGrants } from "@bernouy/ulvia-providers/selections";
import type { StoredContractSelections } from "@bernouy/ulvia-providers/selections";
import type { ContractRelease } from "@bernouy/ulvia-contracts";
/** Retiring an identifier must never reopen its replacement when the old action was denied. */
export function migrationGrants(
    selected: StoredContractSelections,
    target: ContractRelease,
    nativeFormsSelected: boolean,
) {
    const ids = new Set(target.capabilities.map((capability) => capability.id));
    const denied = selected.grants.denied.flatMap((before) => {
        if (!nativeFormsSelected || before.contractId !== target.contractId || ids.has(before.capabilityId)) {
            return [before];
        }
        const capabilityId = `${before.capabilityId}-v2`;
        // A fully retired operation has no remaining invocation authority to deny.
        return ids.has(capabilityId) ? [{ contractId: target.contractId, capabilityId }] : [];
    });
    const unique = new Map(denied.map((item) => [`${item.contractId}:${item.capabilityId}`, item]));
    return parseCapabilityGrants({ ...selected.grants, denied: [...unique.values()] });
}

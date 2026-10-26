import type { CapabilityDefinition } from "../../interfaces/ContractRelease";
import type { CapabilityBinding } from "../../interfaces/CapabilityBinding";

/** Exposure is explicit for every transport. */
export function capabilityBindings(capability: CapabilityDefinition): readonly CapabilityBinding[] {
    return capability.bindings;
}

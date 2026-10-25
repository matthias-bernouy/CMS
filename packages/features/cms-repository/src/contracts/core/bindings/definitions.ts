import type { CapabilityDefinition } from "../../interfaces/ContractRelease";
import type { CapabilityBinding } from "../../interfaces/CapabilityBinding";

/** Legacy HTTP exposure never implies MCP exposure. */
export function capabilityBindings(capability: CapabilityDefinition): readonly CapabilityBinding[] {
    return capability.bindings ?? [{ ...capability.binding!, id: "http" }];
}

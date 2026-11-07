import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function ownCapabilities(source: FeatureDefinition): CapabilitySource[] {
    if (!Array.isArray(source.capabilities) || source.capabilities.length > DEFAULT_RELEASE_LIMITS.maxCapabilities) {
        throw new SdkDefinitionError("Contract capabilities must be a bounded list", "$.capabilities");
    }
    const capabilities = [...source.capabilities];
    const ids = new Set<string>();
    for (const capability of capabilities) {
        if (!capability || typeof capability.id !== "string" || ids.has(capability.id)) {
            throw new SdkDefinitionError("Missing or duplicate capability ID", "$.capabilities");
        }
        ids.add(capability.id);
    }
    return capabilities;
}

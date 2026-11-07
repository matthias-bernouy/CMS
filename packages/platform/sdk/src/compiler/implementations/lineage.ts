import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import { ownCapabilities } from "ulvia-sdk/compiler/contracts/capabilitySources";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Snapshot runtime matching fields before any asynchronous admission; never inspect authored assets or schemas. */
export function captureLineage(feature: FeatureDefinition) {
    const lineage = [];
    const capabilities = new Map<string, CapabilitySource>();
    const seen = new Set<FeatureDefinition>();
    let current: FeatureDefinition | undefined = feature;
    while (current) {
        if (seen.has(current) || seen.size >= 24) {
            throw new SdkDefinitionError("Cyclic or oversized contract lineage", "$.extends");
        }
        seen.add(current);
        const own = ownCapabilities(current);
        lineage.push({
            contractId: current.contractId,
            version: current.version,
            capabilities: own.map((capability) => ({
                id: capability.id,
                access: capability.access,
                behavior: structuredClone(capability.behavior),
                errors: Object.keys(capability.errors).sort(),
            })),
        });
        for (const capability of own) {
            if (capabilities.has(capability.id)) {
                throw new SdkDefinitionError(`Cannot redeclare inherited capability ${capability.id}`);
            }
            capabilities.set(capability.id, capability);
        }
        current = current.extends;
    }
    return { lineage, capabilities };
}

export function assertSourceLineage(
    lineage: ReturnType<typeof captureLineage>["lineage"],
    view: ResolvedContract,
): void {
    if (lineage.length !== view.lineage.length) {
        throw new SdkDefinitionError("Implementation lineage differs from its build artifact");
    }
    for (const [index, { release }] of view.lineage.entries()) {
        const source = lineage[index]!;
        if (source.contractId !== release.contractId || source.version !== release.version) {
            throw new SdkDefinitionError("Implementation lineage differs from its build artifact");
        }
        if (source.capabilities.length !== release.capabilities.length) {
            throw new SdkDefinitionError("Implementation capability coverage differs from its build artifact");
        }
        for (const capability of source.capabilities) {
            const admitted = release.capabilities.find(({ id }) => id === capability.id);
            if (
                !admitted ||
                admitted.access !== capability.access ||
                canonicalizeIJson(admitted.behavior) !== canonicalizeIJson(capability.behavior) ||
                canonicalizeIJson(admitted.errors.map(({ code }) => code).sort()) !==
                    canonicalizeIJson(capability.errors)
            ) {
                throw new SdkDefinitionError(
                    `Implementation capability differs from its build artifact: ${capability.id}`,
                );
            }
        }
    }
}

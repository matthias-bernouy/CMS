import type { CapabilityRequirement } from "../../interfaces/ContractRelease";
import type { CapabilityChange } from "./compareCapability";
import { compareVersionRanges } from "./versionRange";

export function compareRequirements(
    previous: readonly CapabilityRequirement[],
    next: readonly CapabilityRequirement[],
    path: string,
): CapabilityChange[] {
    const changes: CapabilityChange[] = [];
    const nextByKey = new Map(next.map((requirement) => [requirementKey(requirement), requirement]));
    for (const requirement of previous) {
        const replacement = nextByKey.get(requirementKey(requirement));
        if (!replacement) {
            changes.push(major(path, "mandatory capability requirement removed"));
        } else if (replacement.versionRange !== requirement.versionRange) {
            const relation = compareVersionRanges(requirement.versionRange, replacement.versionRange);
            if (relation === "expanded") {
                changes.push({
                    code: "capability_changed",
                    path,
                    message: "accepted dependency versions expanded",
                    requiredBump: "minor",
                });
            } else if (relation === "restricted") {
                changes.push(major(path, "mandatory dependency version range dropped accepted versions"));
            }
        }
    }
    const previousKeys = new Set(previous.map(requirementKey));
    for (const requirement of next) {
        if (!previousKeys.has(requirementKey(requirement))) {
            changes.push(major(path, "mandatory capability requirement added"));
        }
    }
    return changes;
}

function requirementKey(requirement: CapabilityRequirement): string {
    return `${requirement.contractId}\u0000${requirement.capabilityId}`;
}

function major(path: string, message: string): CapabilityChange {
    return { code: "capability_changed", path, message, requiredBump: "major" };
}

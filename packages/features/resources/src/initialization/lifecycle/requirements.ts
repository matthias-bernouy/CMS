import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { validateCapabilityRequirements } from "@bernouy/content";
import type { ContentCapabilityRequirement } from "@bernouy/content";
import type { ResourceInitializationExecution } from "../interfaces";
import { resourceInitializationError } from "../state";

export function assertResourceRequirements(
    requirements: readonly ContentCapabilityRequirement[],
    execution: ResourceInitializationExecution,
): void {
    for (const requirement of requirements) {
        validateCapabilityRequirements([requirement]);
        const contract = execution.selected.find(({ release }) => release.contractId === requirement.contractId);
        if (
            !contract ||
            !satisfiesVersionRange(contract.release.version, requirement.versionRange) ||
            !contract.capabilities.some(({ definition }) => definition.id === requirement.capabilityId) ||
            execution.denied.some(
                (item) => item.contractId === requirement.contractId && item.capabilityId === requirement.capabilityId,
            )
        ) {
            throw resourceInitializationError(
                `Selected execution cannot satisfy resource requirement ${requirement.contractId}/${requirement.capabilityId}`,
                409,
            );
        }
    }
}

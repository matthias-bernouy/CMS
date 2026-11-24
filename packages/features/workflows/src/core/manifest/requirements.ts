import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import type { WorkflowManifest } from "workflows/interfaces/manifest";
import { workflowIssue } from "../errors";

/** Each requirement needs one joint non-yanked release witness. Admission never installs a Provider. */
export async function verifyWorkflowRequirements(
    manifest: WorkflowManifest,
    contracts: ContractReleaseReader,
): Promise<void> {
    for (const requirement of manifest.requirements) {
        const candidates = await contracts.list(requirement.contractId);
        if (candidates.length > 512) {
            workflowIssue("manifest.requirements.catalogueLimit");
        }
        let witnessed = false;
        for (const candidate of candidates) {
            if (
                candidate.yank ||
                !satisfiesVersionRange(candidate.admission.release.version, requirement.versionRange)
            ) {
                continue;
            }
            const resolved = await resolveContract(contracts, candidate.admission);
            if (
                requirement.capabilityIds.every((id) =>
                    resolved.capabilities.some(({ definition }) => definition.id === id),
                ) &&
                requirement.eventIds.every((id) => resolved.events.some(({ definition }) => definition.id === id))
            ) {
                witnessed = true;
                break;
            }
        }
        if (!witnessed) {
            workflowIssue(`manifest.requirements.${requirement.contractId}`);
        }
    }
}

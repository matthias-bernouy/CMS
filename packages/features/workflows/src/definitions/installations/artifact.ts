import { verifyStoredWorkflowManifest } from "workflows/core/manifest/admit";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowInstallation, WorkflowArtifactReference } from "workflows/interfaces/installations";
import type { WorkflowManifest } from "workflows/interfaces/manifest";
import { compileWorkflow } from "workflows/core/compiler";
import { WorkflowError } from "workflows/core/errors";

export function checkedArtifact(json: string, reference: WorkflowArtifactReference) {
    const admission = verifyStoredWorkflowManifest(json, reference.digest);
    const artifact = admission.manifest;
    if (
        artifact.workflowId !== reference.workflowId ||
        artifact.publisherId !== reference.publisherId ||
        artifact.version !== reference.version
    ) {
        throw new WorkflowError("INVALID_INPUT");
    }
    return admission;
}
export function checkedParameters(manifest: WorkflowManifest, json: string) {
    const value = parseStrictJson(json, 1048576, 32);
    validateSchemaValue(manifest.definition.parametersSchema, value);
    return value;
}
export async function installationArtifact(services: WorkflowServices, record: WorkflowInstallation) {
    const json = await services.values.get(`installation:${record.id}`, record.manifestRef);
    if (typeof json !== "string") {
        throw new WorkflowError("CORE_UNAVAILABLE");
    }
    return checkedArtifact(json, record.reference);
}
export async function compileInstallation(services: WorkflowServices, record: WorkflowInstallation) {
    const { manifest } = await installationArtifact(services, record);
    const parameters = await services.values.get(`installation:${record.id}`, record.parametersRef);
    validateSchemaValue(manifest.definition.parametersSchema, parameters);
    const range = (contractId: string, version: string) => {
        const requirement = manifest.requirements.find((entry) => entry.contractId === contractId);
        if (!requirement || !satisfiesVersionRange(version, requirement.versionRange)) {
            throw new WorkflowError("INVALID_DEFINITION", `requirements.${contractId}.versionRange`);
        }
    };
    return compileWorkflow(
        JSON.stringify(manifest.definition),
        {
            ...services.contracts,
            async resolve(contractId, capabilityId) {
                const resolved = await services.contracts.resolve(contractId, capabilityId);
                range(contractId, resolved.target.version);
                return resolved;
            },
            async resolveEvent(contractId, eventType) {
                if (!services.contracts.resolveEvent) {
                    throw new WorkflowError("INVALID_DEFINITION", "trigger.eventsUnavailable");
                }
                const resolved = await services.contracts.resolveEvent(contractId, eventType);
                range(contractId, resolved.version);
                return resolved;
            },
        },
        parameters,
    );
}

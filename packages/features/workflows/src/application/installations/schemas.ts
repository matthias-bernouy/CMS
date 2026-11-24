import { z, contractString } from "@bernouy/ulvia-sdk";
import { id, revision, json } from "../schemas";
import type { WorkflowInstallation } from "workflows/interfaces/installations";
export const artifactReference = z.strictObject({
    repositoryId: id,
    publisherId: contractString({ minLength: 1, maxLength: 96 }),
    workflowId: contractString({ minLength: 3, maxLength: 225 }),
    version: id,
    digest: contractString({ minLength: 71, maxLength: 71 }),
});
export const installation = z.strictObject({
    id,
    revision,
    reference: artifactReference,
    workflowId: id,
    publishedRevision: revision.nullable(),
    state: contractString({ enum: ["installed", "removing", "removed"] as const, maxLength: 9 }),
    updatedAt: contractString({ format: "date-time", maxLength: 32 }),
});
export const installInput = z.strictObject({ installationId: id, reference: artifactReference, parametersJson: json });
export const revisionInput = z.strictObject({ installationId: id, expectedRevision: revision });
export function installationDto(record: WorkflowInstallation) {
    const {
        manifestRef: _manifest,
        parametersRef: _parameters,
        administratorId: _administrator,
        pendingPublication: _pending,
        ...metadata
    } = record;
    return metadata;
}

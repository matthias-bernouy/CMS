import type {
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
} from "../../../../interfaces/publication";
import { INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA } from "../../../../interfaces/publication";
import { freezeCandidateRecord, identifier, invalidCandidate, timestamp } from "./shared";

export function createIntegrationRegistryCandidateRecord(
    input: CreateIntegrationRegistryCandidateInput,
): IntegrationRegistryCandidateRecord {
    identifier(input.candidateId, "candidateId");
    const createdAt = timestamp(input.createdAt, "createdAt");
    const expiresAt = timestamp(input.expiresAt, "expiresAt");
    if (Date.parse(expiresAt) <= Date.parse(createdAt)) {
        invalidCandidate("Candidate expiry must be later than its creation time");
    }
    const envelope = input.candidate.envelope;
    return freezeCandidateRecord({
        schema: INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
        candidateId: input.candidateId,
        revision: 0,
        status: "uploaded",
        kind: envelope.package.kind,
        version: envelope.package.version,
        candidateDigest: input.candidate.candidateDigest,
        packageDigest: input.candidate.packageDigest,
        verificationDigest: input.candidate.verificationDigest,
        ...(envelope.submission.requestedChannel ? { requestedChannel: envelope.submission.requestedChannel } : {}),
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        attemptCount: 0,
    });
}

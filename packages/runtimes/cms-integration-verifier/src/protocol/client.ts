import type { CandidateAdmissionJobResultV1 } from "@bernouy/cms-integration-verification";
import {
    REPOSITORY_VERIFICATION_JOBS_PATH,
    REPOSITORY_VERIFICATION_JOB_CLAIMS_PATH,
    REPOSITORY_VERIFICATION_JOB_LEASE_PATH,
    REPOSITORY_VERIFICATION_JOB_RESULT_CAPABILITIES_PATH,
    REPOSITORY_VERIFICATION_JOB_RESULT_PATH,
} from "@bernouy/cms-repository-management";
import {
    parseCandidateList,
    parseClaimedJob,
    parseRenewedCandidate,
    parseResultCapability,
    parseSubmittedCandidate,
} from "./response";
import { createVerificationProtocolTransport, type VerificationProtocolTransportConfig } from "./transport";
import type { CandidateStatusProjection, CandidateWorkerClient, ClaimedVerificationJob } from "./types";

export type HttpCandidateWorkerClientConfig = VerificationProtocolTransportConfig & Readonly<{ workerId: string }>;

export function createHttpCandidateWorkerClient(config: HttpCandidateWorkerClientConfig): CandidateWorkerClient {
    const request = createVerificationProtocolTransport(config);
    const worker = { kind: "worker" as const };
    return Object.freeze({
        async listClaimable(limit: number) {
            const value = await request(`${REPOSITORY_VERIFICATION_JOBS_PATH}?limit=${limit}`, "GET", worker);
            return parseCandidateList(value);
        },
        async claim(candidate: CandidateStatusProjection) {
            const value = await request(REPOSITORY_VERIFICATION_JOB_CLAIMS_PATH, "POST", worker, {
                candidateId: candidate.candidateId,
                expectedRevision: candidate.revision,
                workerId: config.workerId,
            });
            return await parseClaimedJob(value, config.workerId, candidate);
        },
        async renew(candidate: ClaimedVerificationJob["candidate"]) {
            const value = await request(REPOSITORY_VERIFICATION_JOB_LEASE_PATH, "POST", worker, {
                candidateId: candidate.candidateId,
                expectedRevision: candidate.revision,
                jobId: candidate.lease.jobId,
                attemptId: candidate.lease.attemptId,
                fencingToken: candidate.lease.fencingToken,
                workerId: candidate.lease.workerId,
            });
            return parseRenewedCandidate(value, candidate);
        },
        async seal(candidate: ClaimedVerificationJob["candidate"], resultDigest: string) {
            const value = await request(REPOSITORY_VERIFICATION_JOB_RESULT_CAPABILITIES_PATH, "POST", worker, {
                candidateId: candidate.candidateId,
                jobId: candidate.lease.jobId,
                attemptId: candidate.lease.attemptId,
                fencingToken: candidate.lease.fencingToken,
                workerId: candidate.lease.workerId,
                resultDigest,
            });
            return parseResultCapability(value, resultDigest, candidate.lease.leaseExpiresAt);
        },
        async submit(
            candidate: ClaimedVerificationJob["candidate"],
            capability: Readonly<{ token: string; expiresAt: string; resultDigest: string }>,
            result: CandidateAdmissionJobResultV1,
        ) {
            const value = await request(
                REPOSITORY_VERIFICATION_JOB_RESULT_PATH,
                "POST",
                { kind: "capability", token: capability.token },
                { expectedRevision: candidate.revision, result },
            );
            return parseSubmittedCandidate(value, candidate);
        },
    });
}

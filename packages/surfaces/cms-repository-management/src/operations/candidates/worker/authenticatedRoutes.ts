import type { Runner } from "@bernouy/http-runner";
import { readCanonicalClaimRequest, readCanonicalRenewRequest, readCanonicalResultCapabilityRequest } from "../body";
import {
    projectCandidateStatus,
    REPOSITORY_VERIFICATION_JOBS_PATH,
    REPOSITORY_VERIFICATION_JOB_CLAIMS_PATH,
    REPOSITORY_VERIFICATION_JOB_LEASE_PATH,
    REPOSITORY_VERIFICATION_JOB_RESULT_CAPABILITIES_PATH,
    type RepositoryCandidateWorkerRoutesConfig,
} from "../contracts";
import {
    candidateJsonResponse,
    candidateProtocolErrorResponse,
    workerAttemptConflict,
    workerCapabilityUnauthorized,
} from "../responses";
import {
    addWorkerLeaseDuration,
    canonicalWorkerTimestamp,
    readWorkerListLimit,
    resultCapabilityIdentity,
    sameCandidateLease,
} from "./shared";

export function mountAuthenticatedWorkerRoutes(runner: Runner, config: RepositoryCandidateWorkerRoutesConfig): void {
    runner.get(REPOSITORY_VERIFICATION_JOBS_PATH, (request) => listJobs(request, config));
    runner.post(REPOSITORY_VERIFICATION_JOB_CLAIMS_PATH, (request) => claimJob(request, config));
    runner.post(REPOSITORY_VERIFICATION_JOB_LEASE_PATH, (request) => renewLease(request, config));
    runner.post(REPOSITORY_VERIFICATION_JOB_RESULT_CAPABILITIES_PATH, (request) => sealResult(request, config));
}

async function listJobs(request: Request, config: RepositoryCandidateWorkerRoutesConfig): Promise<Response> {
    try {
        const now = canonicalWorkerTimestamp(config.now());
        const limit = readWorkerListLimit(request);
        await config.store.recoverExpiredLeases(now, limit);
        await config.store.expireDueCandidates(now, limit);
        const candidates = await config.store.listClaimable(now, limit);
        return candidateJsonResponse(200, {
            candidates: candidates.map((candidate) => projectCandidateStatus(candidate)),
        });
    } catch (error) {
        return candidateProtocolErrorResponse(error);
    }
}

async function claimJob(request: Request, config: RepositoryCandidateWorkerRoutesConfig): Promise<Response> {
    try {
        const input = await readCanonicalClaimRequest(request, config.maxBodyBytes);
        const objects = await config.store.objects(input.candidateId);
        if (!objects.policy || !objects.admission) {
            throw new Error("Candidate has no exact admission plan");
        }
        const current = await config.store.get(input.candidateId);
        const now = canonicalWorkerTimestamp(config.now());
        const record = await config.store.claim(input.candidateId, {
            expectedRevision: input.expectedRevision,
            jobId: config.createJobId(),
            attemptId: config.createAttemptId(),
            workerId: input.workerId,
            now,
            leaseExpiresAt: addWorkerLeaseDuration(now, config.leaseDurationMs, current?.expiresAt),
        });
        return candidateJsonResponse(201, {
            candidate: projectCandidateStatus(record),
            workload: {
                package: objects.package,
                verification: objects.verification,
                policy: objects.policy,
                admission: objects.admission,
            },
        });
    } catch (error) {
        return candidateProtocolErrorResponse(error);
    }
}

async function renewLease(request: Request, config: RepositoryCandidateWorkerRoutesConfig): Promise<Response> {
    try {
        const input = await readCanonicalRenewRequest(request, config.maxBodyBytes);
        const current = await config.store.get(input.candidateId);
        if (!sameCandidateLease(current?.lease, input)) {
            return workerAttemptConflict();
        }
        const now = canonicalWorkerTimestamp(config.now());
        const record = await config.store.renew(input.candidateId, {
            expectedRevision: input.expectedRevision,
            attemptId: input.attemptId,
            fencingToken: input.fencingToken,
            now,
            leaseExpiresAt: addWorkerLeaseDuration(now, config.leaseDurationMs, current?.expiresAt),
        });
        return candidateJsonResponse(200, { candidate: projectCandidateStatus(record) });
    } catch (error) {
        return candidateProtocolErrorResponse(error);
    }
}

async function sealResult(request: Request, config: RepositoryCandidateWorkerRoutesConfig): Promise<Response> {
    try {
        const input = await readCanonicalResultCapabilityRequest(request, config.maxBodyBytes);
        const current = await config.store.get(input.candidateId);
        if (!sameCandidateLease(current?.lease, input)) {
            return workerAttemptConflict();
        }
        const now = canonicalWorkerTimestamp(config.now());
        if (Date.parse(now) >= Date.parse(current.lease.leaseExpiresAt)) {
            return workerCapabilityUnauthorized();
        }
        const identity = resultCapabilityIdentity(current, input.resultDigest);
        return candidateJsonResponse(201, {
            capability: {
                token: config.capabilityAuthority.issue(identity),
                expiresAt: identity.leaseExpiresAt,
                resultDigest: identity.resultDigest,
            },
        });
    } catch (error) {
        return candidateProtocolErrorResponse(error);
    }
}

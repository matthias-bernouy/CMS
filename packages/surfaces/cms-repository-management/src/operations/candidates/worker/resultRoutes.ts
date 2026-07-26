import { identifyVerificationJobResult } from "@bernouy/cms-integration-verification";
import type { Runner } from "@bernouy/http-runner";
import { readRepositoryWorkerCapability } from "../auth";
import { readCanonicalResultRequest } from "../body";
import {
    projectCandidateStatus,
    REPOSITORY_VERIFICATION_JOB_RESULT_PATH,
    type RepositoryCandidateWorkerRoutesConfig,
} from "../contracts";
import {
    candidateJsonResponse,
    candidateProtocolErrorResponse,
    workerAttemptConflict,
    workerCapabilityUnauthorized,
} from "../responses";
import { canonicalWorkerTimestamp, resultMatchesCapability, sameCandidateLease } from "./shared";

export function mountWorkerResultRoutes(runner: Runner, config: RepositoryCandidateWorkerRoutesConfig): void {
    runner.post(REPOSITORY_VERIFICATION_JOB_RESULT_PATH, async (request) => {
        try {
            const now = canonicalWorkerTimestamp(config.now());
            const token = readRepositoryWorkerCapability(request);
            const identity = token ? config.capabilityAuthority.verify(token, now) : null;
            if (!identity) {
                return workerCapabilityUnauthorized();
            }
            const input = await readCanonicalResultRequest(request, config.maxResultBodyBytes);
            const identified = await identifyVerificationJobResult(input.result);
            const current = await config.store.get(identity.candidateId);
            const exactReplay = !current?.lease && current?.verificationJobResultDigest === identity.resultDigest;
            if (
                identified.digest !== identity.resultDigest ||
                !resultMatchesCapability(input.result, identity) ||
                (!exactReplay && !sameCandidateLease(current?.lease, identity))
            ) {
                return workerAttemptConflict();
            }
            let record = exactReplay
                ? current
                : await config.store.complete(identity.candidateId, {
                      expectedRevision: input.expectedRevision,
                      now,
                      result: input.result,
                  });
            if (!record) {
                return workerAttemptConflict();
            }
            if (config.publication && (record.status === "passed" || record.status === "publishing")) {
                record = await config.publication.finalize(record.candidateId);
            }
            return candidateJsonResponse(200, { candidate: projectCandidateStatus(record) });
        } catch (error) {
            return candidateProtocolErrorResponse(error);
        }
    });
}

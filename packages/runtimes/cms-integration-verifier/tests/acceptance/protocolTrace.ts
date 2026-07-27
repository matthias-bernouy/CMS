import type { CandidateAdmissionJobResultV1 } from "@bernouy/cms-integration-verification";
import type {
    CandidateStatusProjection,
    CandidateWorkerClient,
    ClaimedVerificationJob,
    ResultCapability,
} from "../../src";

export type OfficialCandidateTrace = {
    claimed?: ClaimedVerificationJob;
    capability?: ResultCapability;
    result?: CandidateAdmissionJobResultV1;
    submitted?: CandidateStatusProjection;
};

export function tracedClient(client: CandidateWorkerClient, trace: OfficialCandidateTrace): CandidateWorkerClient {
    return {
        listClaimable: (limit) => client.listClaimable(limit),
        async claim(candidate) {
            const claimed = await client.claim(candidate);
            trace.claimed = claimed;
            return claimed;
        },
        renew: (candidate) => client.renew(candidate),
        async seal(candidate, resultDigest) {
            const capability = await client.seal(candidate, resultDigest);
            trace.capability = capability;
            return capability;
        },
        async submit(candidate, capability, result) {
            trace.result = result;
            const submitted = await client.submit(candidate, capability, result);
            trace.submitted = submitted;
            return submitted;
        },
    };
}

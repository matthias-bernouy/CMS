import {
    identifyCandidateAdmissionJobResult,
    type CandidateAdmissionJobResultV1,
} from "@bernouy/cms-integration-verification";
import type {
    CandidateStatusProjection,
    CandidateWorkerClient,
    ClaimedVerificationJob,
    ResultCapability,
} from "../../src";
import { claimedJob, queuedCandidate } from "./workload";

export type FakeWorkerControls = Readonly<{
    renew?: (candidate: ClaimedVerificationJob["candidate"]) => Promise<ClaimedVerificationJob["candidate"]>;
    seal?: (candidate: ClaimedVerificationJob["candidate"], resultDigest: string) => Promise<ResultCapability>;
    submit?: (
        candidate: ClaimedVerificationJob["candidate"],
        capability: ResultCapability,
        result: CandidateAdmissionJobResultV1,
    ) => Promise<CandidateStatusProjection>;
}>;

export async function createFakeWorkerClient(controls: FakeWorkerControls = {}) {
    const queued = await queuedCandidate();
    const claimed = await claimedJob();
    const submissions: Array<Readonly<{ capability: ResultCapability; result: CandidateAdmissionJobResultV1 }>> = [];
    const calls: string[] = [];
    const client: CandidateWorkerClient = {
        async listClaimable() {
            calls.push("list");
            return [queued];
        },
        async claim() {
            calls.push("claim");
            return claimed;
        },
        async renew(candidate) {
            calls.push("renew");
            if (controls.renew) {
                return await controls.renew(candidate);
            }
            return renewedCandidate(candidate);
        },
        async seal(candidate, resultDigest) {
            calls.push("seal");
            if (controls.seal) {
                return await controls.seal(candidate, resultDigest);
            }
            return {
                token: "exact-capability-token",
                expiresAt: candidate.lease.leaseExpiresAt,
                resultDigest,
            };
        },
        async submit(candidate, capability, result) {
            calls.push("submit");
            submissions.push({ capability, result });
            if (controls.submit) {
                return await controls.submit(candidate, capability, result);
            }
            const identified = await identifyCandidateAdmissionJobResult(result);
            if (identified.digest !== capability.resultDigest) {
                throw new Error("result digest mismatch");
            }
            return {
                ...candidate,
                revision: candidate.revision + 1,
                status: "passed",
                updatedAt: "2026-07-26T12:30:00.000Z",
                lease: undefined,
            };
        },
    };
    return { client, calls, claimed, submissions };
}

export function renewedCandidate(candidate: ClaimedVerificationJob["candidate"]): ClaimedVerificationJob["candidate"] {
    return {
        ...candidate,
        revision: candidate.revision + 1,
        updatedAt: "2026-07-26T12:15:00.000Z",
        lease: {
            ...candidate.lease,
            leaseExpiresAt: "2026-07-26T13:30:00.000Z",
        },
    };
}

export function immediateScheduler(now = Date.parse("2026-07-26T12:00:00.000Z")) {
    return {
        now: () => now,
        async sleep(_duration: number, signal: AbortSignal) {
            await new Promise<void>((resolve) => {
                if (signal.aborted) {
                    resolve();
                    return;
                }
                queueMicrotask(resolve);
            });
        },
    };
}

export function pausedScheduler(now = Date.parse("2026-07-26T12:00:00.000Z")) {
    return {
        now: () => now,
        async sleep(_duration: number, signal: AbortSignal) {
            await new Promise<void>((resolve) => {
                if (signal.aborted) {
                    resolve();
                    return;
                }
                signal.addEventListener("abort", () => resolve(), { once: true });
            });
        },
    };
}

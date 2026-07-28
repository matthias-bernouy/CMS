import type { ClaimedVerificationJob, CandidateWorkerClient } from "../../protocol";
import { VerificationSupervisorError } from "../error";
import type { VerificationRenewalScheduler } from "../types";

type RunningCandidate = ClaimedVerificationJob["candidate"];

export async function runWithLeaseRenewal<T>(config: {
    client: CandidateWorkerClient;
    initial: RunningCandidate;
    intervalMs: number;
    scheduler: VerificationRenewalScheduler;
    signal?: AbortSignal;
    operation(signal: AbortSignal): Promise<T>;
}): Promise<Readonly<{ value: T; candidate: RunningCandidate }>> {
    const stop = new AbortController();
    const operation = new AbortController();
    let current = config.initial;
    const renewal = renewUntilStopped(
        config,
        stop.signal,
        () => current,
        (candidate) => {
            current = candidate;
        },
    );
    const monitoredRenewal = renewal.then(() => new Promise<never>(() => undefined));
    const operationTask = Promise.resolve().then(async () => await config.operation(operation.signal));
    operationTask.catch(() => undefined);
    const externalAbort = waitForAbort(config.signal);
    let value: T | undefined;
    let operationError: unknown;
    let operationFailed = false;
    try {
        value = await Promise.race([operationTask, monitoredRenewal, externalAbort.promise]);
    } catch (error) {
        operationFailed = true;
        operationError = error;
    }
    externalAbort.dispose();
    stop.abort();
    let renewalFailed = operationError instanceof LeaseRenewalFailure;
    try {
        await renewal;
    } catch {
        renewalFailed = true;
    }
    if (renewalFailed) {
        operation.abort();
        await operationTask.catch(() => undefined);
        throw new VerificationSupervisorError("lease-lost", "Verification lease was lost", true);
    }
    if (operationError instanceof OperationAborted) {
        operation.abort();
        await operationTask.catch(() => undefined);
        throw new VerificationSupervisorError("aborted", "Verification supervisor was stopped", true);
    }
    if (operationFailed) {
        throw operationError;
    }
    return { value: value as T, candidate: current };
}

async function renewUntilStopped(
    config: Parameters<typeof runWithLeaseRenewal>[0],
    signal: AbortSignal,
    current: () => RunningCandidate,
    update: (candidate: RunningCandidate) => void,
): Promise<void> {
    while (!signal.aborted) {
        const previous = current();
        const remaining = Date.parse(previous.lease.leaseExpiresAt) - config.scheduler.now();
        if (remaining <= 0) {
            throw new LeaseRenewalFailure();
        }
        const delay = Math.min(config.intervalMs, Math.max(1, Math.floor(remaining / 2)));
        await config.scheduler.sleep(delay, signal);
        if (signal.aborted) {
            return;
        }
        try {
            const renewed = await config.client.renew(previous);
            if (
                !sameCandidateAttempt(previous, renewed) ||
                Date.parse(renewed.lease.leaseExpiresAt) <= config.scheduler.now()
            ) {
                throw new Error("invalid renewal");
            }
            update(renewed);
        } catch {
            throw new LeaseRenewalFailure();
        }
    }
}

function sameCandidateAttempt(previous: RunningCandidate, renewed: RunningCandidate): boolean {
    return (
        renewed.candidateId === previous.candidateId &&
        renewed.candidateDigest === previous.candidateDigest &&
        renewed.packageDigest === previous.packageDigest &&
        renewed.verificationDigest === previous.verificationDigest &&
        renewed.revision > previous.revision &&
        renewed.lease.jobId === previous.lease.jobId &&
        renewed.lease.attemptId === previous.lease.attemptId &&
        renewed.lease.fencingToken === previous.lease.fencingToken &&
        renewed.lease.workerId === previous.lease.workerId &&
        renewed.lease.leaseExpiresAt <= renewed.expiresAt
    );
}

class LeaseRenewalFailure extends Error {}

class OperationAborted extends Error {}

function waitForAbort(signal: AbortSignal | undefined) {
    if (!signal) {
        return { promise: new Promise<never>(() => undefined), dispose() {} };
    }
    if (signal.aborted) {
        return { promise: Promise.reject(new OperationAborted()), dispose() {} };
    }
    let onAbort: (() => void) | undefined;
    const promise = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new OperationAborted());
        signal.addEventListener("abort", onAbort, { once: true });
    });
    return {
        promise,
        dispose() {
            if (onAbort) {
                signal.removeEventListener("abort", onAbort);
            }
        },
    };
}

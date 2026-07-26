import { validateVerificationJobResultForAdmission } from "@bernouy/cms-integration-verification";
import type { ClaimedVerificationJob } from "../../protocol";
import { VerificationSupervisorError } from "../error";
import type {
    DisposableVerificationDatabaseLease,
    VerificationSandboxInput,
    VerificationSupervisorConfig,
} from "../types";
import { validateDisposableDatabaseCredential } from "./credential";
import { sanitizeSandboxResult } from "./diagnostics";

export function validatedCredential(database: DisposableVerificationDatabaseLease) {
    try {
        return validateDisposableDatabaseCredential(database.credential);
    } catch {
        throw new VerificationSupervisorError(
            "invalid-database-credential",
            "Disposable database credential is invalid",
            false,
        );
    }
}

export function immutableSandboxInput(
    claimed: ClaimedVerificationJob,
    database: VerificationSandboxInput["database"],
): VerificationSandboxInput {
    return deepFreeze(
        structuredClone({
            workload: {
                ...claimed.workload,
                attempt: {
                    jobId: claimed.candidate.lease.jobId,
                    attemptId: claimed.candidate.lease.attemptId,
                    fencingToken: claimed.candidate.lease.fencingToken,
                },
            },
            database,
        }),
    );
}

export async function validateSandboxResult(
    result: Awaited<ReturnType<VerificationSupervisorConfig["sandbox"]["run"]>>,
    candidate: ClaimedVerificationJob["candidate"],
    claimed: ClaimedVerificationJob,
    credential: VerificationSandboxInput["database"],
) {
    try {
        const sanitized = sanitizeSandboxResult(result, credential);
        return await validateVerificationJobResultForAdmission(
            sanitized,
            claimed.workload.admission,
            claimed.workload.policy,
            {
                jobId: candidate.lease.jobId,
                attemptId: candidate.lease.attemptId,
                fencingToken: candidate.lease.fencingToken,
            },
        );
    } catch {
        throw new VerificationSupervisorError("sandbox-result-invalid", "Sandbox result is invalid", false);
    }
}

export function assertClaimMatches(
    expected: Readonly<{ candidateId: string; candidateDigest: string }>,
    claimed: ClaimedVerificationJob,
): void {
    if (
        claimed.candidate.candidateId !== expected.candidateId ||
        claimed.candidate.candidateDigest !== expected.candidateDigest
    ) {
        throw new VerificationSupervisorError("lease-lost", "Claim response substituted another candidate", false);
    }
}

export function assertLeaseAlive(candidate: ClaimedVerificationJob["candidate"], now: number): void {
    if (Date.parse(candidate.lease.leaseExpiresAt) <= now) {
        throw new VerificationSupervisorError("lease-lost", "Verification lease expired before result sealing", true);
    }
}

export function assertSandboxRunner(config: VerificationSupervisorConfig, claimed: ClaimedVerificationJob): void {
    const selected = claimed.workload.admission.selectedRunner;
    const available = config.sandbox.identity;
    if (
        selected.name !== available.name ||
        selected.version !== available.version ||
        selected.imageDigest !== available.imageDigest
    ) {
        throw new VerificationSupervisorError(
            "runner-mismatch",
            "Claimed workload requires another exact verification runner",
            false,
        );
    }
}

export function assertSupervisorConfig(config: VerificationSupervisorConfig): void {
    if (!Number.isSafeInteger(config.jobListLimit) || config.jobListLimit < 1 || config.jobListLimit > 100) {
        throw new TypeError("Verification job-list limit must be between 1 and 100");
    }
    if (!Number.isSafeInteger(config.leaseRenewalIntervalMs) || config.leaseRenewalIntervalMs < 1) {
        throw new TypeError("Verification lease-renewal interval must be positive");
    }
}

function deepFreeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
    }
    return value;
}

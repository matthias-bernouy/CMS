import { VerificationProtocolError, type ClaimedVerificationJob } from "../../protocol";
import { VerificationSupervisorError } from "../error";
import { runWithLeaseRenewal } from "./leaseRenewal";
import { createDefaultVerificationRenewalScheduler } from "../scheduler";
import type {
    DisposableVerificationDatabaseLease,
    VerificationSupervisor,
    VerificationSupervisorConfig,
    VerificationSupervisorRunResult,
} from "../types";
import {
    assertClaimMatches,
    assertLeaseAlive,
    assertSandboxRunner,
    assertSupervisorConfig,
    immutableSandboxInput,
    validatedCredential,
    validateSandboxResult,
} from "./validation";

export function createVerificationSupervisor(config: VerificationSupervisorConfig): VerificationSupervisor {
    assertSupervisorConfig(config);
    const scheduler = config.scheduler ?? createDefaultVerificationRenewalScheduler();
    let active = false;
    return Object.freeze({
        async runNext(signal = new AbortController().signal): Promise<VerificationSupervisorRunResult> {
            if (active) {
                throw new VerificationSupervisorError(
                    "already-running",
                    "Verification supervisor is already running",
                    false,
                );
            }
            if (signal.aborted) {
                throw new VerificationSupervisorError("aborted", "Verification supervisor was stopped", true);
            }
            active = true;
            try {
                await assertDatabaseAvailable(config, signal);
                const candidates = await config.client.listClaimable(config.jobListLimit);
                if (candidates.length === 0) {
                    return { outcome: "idle" };
                }
                const claimed = await config.client.claim(candidates[0]!);
                assertClaimMatches(candidates[0]!, claimed);
                return await executeClaim(config, scheduler, claimed, signal);
            } finally {
                active = false;
            }
        },
    });
}

async function executeClaim(
    config: VerificationSupervisorConfig,
    scheduler: NonNullable<VerificationSupervisorConfig["scheduler"]>,
    claimed: ClaimedVerificationJob,
    signal: AbortSignal,
): Promise<VerificationSupervisorRunResult> {
    assertSandboxRunner(config, claimed);
    await assertDatabaseAvailable(config, signal);
    let database: DisposableVerificationDatabaseLease;
    try {
        database = await config.databases.acquire(
            {
                candidateId: claimed.candidate.candidateId,
                packageDigest: claimed.candidate.packageDigest,
                verificationDigest: claimed.candidate.verificationDigest,
            },
            signal,
        );
    } catch {
        if (signal.aborted) {
            throw new VerificationSupervisorError("aborted", "Verification supervisor was stopped", true);
        }
        throw new VerificationSupervisorError(
            "database-unavailable",
            "Disposable verification database is unavailable",
            true,
        );
    }
    let operationFailed = false;
    try {
        const credential = validatedCredential(database);
        const execution = await runSandboxWithRenewal(config, scheduler, claimed, credential, signal);
        const identified = await validateSandboxResult(execution.value, execution.candidate, claimed, credential);
        assertLeaseAlive(execution.candidate, scheduler.now());
        const capability = await config.client.seal(execution.candidate, identified.digest);
        if (
            capability.resultDigest !== identified.digest ||
            capability.expiresAt !== execution.candidate.lease.leaseExpiresAt ||
            Date.parse(capability.expiresAt) <= scheduler.now()
        ) {
            throw new VerificationSupervisorError("capability-invalid", "Result capability is not exact", false);
        }
        const submitted = await config.client.submit(execution.candidate, capability, identified.result);
        return {
            outcome: "submitted",
            candidateId: execution.candidate.candidateId,
            resultDigest: identified.digest,
            status: submitted.status,
        };
    } catch (error) {
        operationFailed = true;
        if (error instanceof VerificationProtocolError || error instanceof VerificationSupervisorError) {
            throw error;
        }
        throw new VerificationSupervisorError("sandbox-failed", "Verification sandbox failed", true);
    } finally {
        try {
            await database.release();
        } catch {
            if (!operationFailed) {
                throw new VerificationSupervisorError(
                    "database-release-failed",
                    "Disposable verification database cleanup failed",
                    true,
                );
            }
        }
    }
}

async function assertDatabaseAvailable(config: VerificationSupervisorConfig, signal: AbortSignal): Promise<void> {
    try {
        await config.databases.probe(signal);
    } catch {
        if (signal.aborted) {
            throw new VerificationSupervisorError("aborted", "Verification supervisor was stopped", true);
        }
        throw new VerificationSupervisorError(
            "database-unavailable",
            "Disposable verification database is unavailable",
            true,
        );
    }
}

async function runSandboxWithRenewal(
    config: VerificationSupervisorConfig,
    scheduler: NonNullable<VerificationSupervisorConfig["scheduler"]>,
    claimed: ClaimedVerificationJob,
    credential: ReturnType<typeof validatedCredential>,
    signal: AbortSignal,
) {
    const input = immutableSandboxInput(claimed, credential);
    return await runWithLeaseRenewal({
        client: config.client,
        initial: claimed.candidate,
        intervalMs: config.leaseRenewalIntervalMs,
        scheduler,
        signal,
        operation: async (signal) => await config.sandbox.run(input, signal),
    });
}

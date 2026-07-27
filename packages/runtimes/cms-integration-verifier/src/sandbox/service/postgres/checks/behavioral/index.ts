import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { checkEvidence, finding } from "../../evidence";
import { BEHAVIORAL_RLS_CHECK_IDS, BEHAVIORAL_RLS_LIMITS } from "./constants";
import { inspectBehavioralRlsEnvironment } from "./environment";
import { inspectBehavioralRlsReads, inspectBehavioralRlsWrites, seedBehavioralRlsFixtures } from "./execution";
import { inspectSupabaseActorSessions } from "./session";
import type { BehavioralRlsProbe, BehavioralRlsProof } from "./types";
import { assertBehavioralRlsProbes } from "./validation";

export { BEHAVIORAL_RLS_CHECK_IDS, BEHAVIORAL_RLS_IDENTITIES, BEHAVIORAL_RLS_LIMITS } from "./constants";
export type { BehavioralRlsFixture, BehavioralRlsProbe, BehavioralRlsProof, BehavioralRlsScalar } from "./types";

export async function proveBehavioralRlsIsolation(
    database: SQL,
    probes: readonly BehavioralRlsProbe[],
    signal: AbortSignal,
): Promise<BehavioralRlsProof> {
    try {
        assertBehavioralRlsProbes(probes);
    } catch {
        return await failedProof(probes.length, "postgres-rls-behavior-plan-invalid", "behavioral-plan");
    }
    const orderedProbes = [...probes].toSorted((left, right) =>
        left.probeId < right.probeId ? -1 : left.probeId > right.probeId ? 1 : 0,
    );
    const environment = await inspectBehavioralRlsEnvironment(database);
    if (environment.findings.length > 0) {
        return await skippedProof(
            probes.length,
            environment.observation,
            environment.findings,
            "postgres-rls-behavior-environment-unavailable",
        );
    }
    let transactionStarted = false;
    try {
        signal.throwIfAborted();
        await database.unsafe("begin");
        transactionStarted = true;
        await database.unsafe(
            `set local statement_timeout = '${BEHAVIORAL_RLS_LIMITS.statementTimeoutMs}ms';
             set local lock_timeout = '${BEHAVIORAL_RLS_LIMITS.lockTimeoutMs}ms';
             set local row_security = on`,
        );
        const actors = await inspectSupabaseActorSessions(database, signal);
        const runtimeObservation = { database: environment.observation, actors: actors.observations };
        if (actors.findings.length > 0) {
            return await skippedProof(
                probes.length,
                runtimeObservation,
                actors.findings,
                "postgres-rls-behavior-environment-unavailable",
            );
        }
        await seedBehavioralRlsFixtures(database, orderedProbes, signal);
        const reads = await inspectBehavioralRlsReads(database, orderedProbes, signal);
        const writes = await inspectBehavioralRlsWrites(database, orderedProbes, signal);
        return {
            environment: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.environment, runtimeObservation, []),
            reads: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.reads, reads.observations, reads.findings),
            writes: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.writes, writes.observations, writes.findings),
        };
    } catch (error) {
        if (signal.aborted) {
            throw signal.reason;
        }
        if (infrastructureFailure(error)) {
            throw error;
        }
        return await failedProof(probes.length, "postgres-rls-behavior-target-unexecutable", "behavioral-target");
    } finally {
        if (transactionStarted) {
            await database.unsafe("rollback");
        }
    }
}

async function skippedProof(
    probeCount: number,
    environmentObservation: unknown,
    environmentFindings: readonly PlatformVerificationFindingV1[],
    skippedCode: string,
): Promise<BehavioralRlsProof> {
    const skipped = [finding(skippedCode, "behavioral-proof")];
    return {
        environment: await checkEvidence(
            BEHAVIORAL_RLS_CHECK_IDS.environment,
            environmentObservation,
            environmentFindings,
        ),
        reads: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.reads, { executed: false, probeCount }, skipped),
        writes: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.writes, { executed: false, probeCount }, skipped),
    };
}

async function failedProof(probeCount: number, code: string, path: string): Promise<BehavioralRlsProof> {
    const findings = [finding(code, path)];
    return await skippedProof(probeCount, { valid: false, probeCount }, findings, code);
}

function infrastructureFailure(error: unknown): boolean {
    const postgres = error as { errno?: unknown; code?: unknown };
    const code = typeof postgres.errno === "string" ? postgres.errno : postgres.code;
    return (
        typeof code === "string" &&
        (/^08/u.test(code) ||
            ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ETIMEDOUT"].includes(code))
    );
}

import { SQL } from "bun";
import {
    validateBehavioralRlsPlan,
    type BehavioralRlsPlanV1,
    type PlatformVerificationFindingV1,
} from "@bernouy/cms-integration-verification";
import { checkEvidence, finding } from "../../evidence";
import { BEHAVIORAL_RLS_CHECK_IDS, BEHAVIORAL_RLS_LIMITS } from "./constants";
import { inspectBehavioralRlsEnvironment } from "./environment";
import { inspectBehavioralRlsReads, inspectBehavioralRlsWrites, seedBehavioralRlsFixtures } from "./execution";
import { createBehavioralRlsActors, inspectSupabaseActorSessions } from "./session";
import type { BehavioralRlsExposedRelation, BehavioralRlsProof } from "./types";
import { behavioralRlsCoverage } from "./validation";

export { BEHAVIORAL_RLS_CHECK_IDS, BEHAVIORAL_RLS_LIMITS } from "./constants";
export type {
    BehavioralRlsExposedRelation,
    BehavioralRlsFixture,
    BehavioralRlsProbe,
    BehavioralRlsProof,
    BehavioralRlsScalar,
} from "./types";

export async function proveBehavioralRlsIsolation(
    database: SQL,
    plan: BehavioralRlsPlanV1,
    exposedRelations: readonly BehavioralRlsExposedRelation[],
    signal: AbortSignal,
): Promise<BehavioralRlsProof> {
    let validated: BehavioralRlsPlanV1;
    try {
        validated = validateBehavioralRlsPlan(plan);
    } catch {
        return await failedProof(0, "postgres-rls-behavior-plan-invalid", "behavioral-plan");
    }
    const coverage = behavioralRlsCoverage(validated.probes, exposedRelations);
    if (!coverage.exact) {
        return await failedProof(
            validated.probes.length,
            "postgres-rls-behavior-plan-coverage-mismatch",
            "behavioral-plan.coverage",
            coverage,
        );
    }
    const orderedProbes = [...validated.probes].toSorted((left, right) =>
        left.probeId < right.probeId ? -1 : left.probeId > right.probeId ? 1 : 0,
    );
    const environment = await inspectBehavioralRlsEnvironment(database);
    if (environment.findings.length > 0) {
        return await skippedProof(
            validated.probes.length,
            { database: environment.observation, coverage },
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
        const actorIdentities = createBehavioralRlsActors();
        const actors = await inspectSupabaseActorSessions(database, actorIdentities, signal);
        const runtimeObservation = { database: environment.observation, coverage, actors: actors.observations };
        if (actors.findings.length > 0) {
            return await skippedProof(
                validated.probes.length,
                runtimeObservation,
                actors.findings,
                "postgres-rls-behavior-environment-unavailable",
            );
        }
        const seeds = await seedBehavioralRlsFixtures(database, orderedProbes, actorIdentities, signal);
        const reads = await inspectBehavioralRlsReads(database, orderedProbes, actorIdentities, signal);
        const writes = await inspectBehavioralRlsWrites(database, orderedProbes, actorIdentities, signal);
        return {
            environment: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.environment, runtimeObservation, []),
            reads: await checkEvidence(BEHAVIORAL_RLS_CHECK_IDS.reads, reads.observations, reads.findings),
            writes: await checkEvidence(
                BEHAVIORAL_RLS_CHECK_IDS.writes,
                [...seeds.observations, ...writes.observations],
                [...seeds.findings, ...writes.findings],
            ),
        };
    } catch (error) {
        if (signal.aborted) {
            throw signal.reason;
        }
        if (infrastructureFailure(error)) {
            throw error;
        }
        return await failedProof(
            validated.probes.length,
            "postgres-rls-behavior-target-unexecutable",
            "behavioral-target",
        );
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

async function failedProof(
    probeCount: number,
    code: string,
    path: string,
    observation: unknown = { valid: false, probeCount },
): Promise<BehavioralRlsProof> {
    const findings = [finding(code, path)];
    return await skippedProof(probeCount, observation, findings, code);
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

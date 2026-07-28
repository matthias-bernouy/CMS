import type { SQL } from "bun";
import { expect, test } from "bun:test";
import {
    BEHAVIORAL_RLS_LIMITS,
    proveBehavioralRlsIsolation,
} from "../../../src/sandbox/service/postgres/checks/behavioral";
import { BEHAVIORAL_PROBE, BEHAVIORAL_SURFACE, behavioralPlan } from "./behavioralFixture";

const unreachableDatabase = {} as SQL;

test("fails closed before database access for incomplete coverage, oversized, or ambiguous probes", async () => {
    const missing = await proveBehavioralRlsIsolation(
        unreachableDatabase,
        behavioralPlan([]),
        BEHAVIORAL_SURFACE,
        new AbortController().signal,
    );
    expect(outcomes(missing)).toEqual(["failed", "failed", "failed"]);
    expect(missing.environment.findings.map(({ code }) => code)).toEqual([
        "postgres-rls-behavior-plan-coverage-mismatch",
    ]);

    const oversized = Array.from({ length: BEHAVIORAL_RLS_LIMITS.probes + 1 }, (_, index) => ({
        ...BEHAVIORAL_PROBE,
        probeId: `probe-${index}`,
    }));
    expect(
        outcomes(
            await proveBehavioralRlsIsolation(
                unreachableDatabase,
                behavioralPlan(oversized),
                BEHAVIORAL_SURFACE,
                new AbortController().signal,
            ),
        ),
    ).toEqual(["failed", "failed", "failed"]);

    const duplicateKey = {
        ...BEHAVIORAL_PROBE,
        second: { ...BEHAVIORAL_PROBE.second, key: BEHAVIORAL_PROBE.first.key },
    };
    expect(
        outcomes(
            await proveBehavioralRlsIsolation(
                unreachableDatabase,
                behavioralPlan([duplicateKey]),
                BEHAVIORAL_SURFACE,
                new AbortController().signal,
            ),
        ),
    ).toEqual(["failed", "failed", "failed"]);

    const unknownField = { ...BEHAVIORAL_PROBE, authorOverride: true };
    expect(
        outcomes(
            await proveBehavioralRlsIsolation(
                unreachableDatabase,
                behavioralPlan([unknownField]),
                BEHAVIORAL_SURFACE,
                new AbortController().signal,
            ),
        ),
    ).toEqual(["failed", "failed", "failed"]);

    const maximalFixture = { ...BEHAVIORAL_PROBE.first, values: { secret: "x".repeat(4_096) } };
    const oversizedBytes = Array.from({ length: BEHAVIORAL_RLS_LIMITS.probes }, (_, index) => ({
        ...BEHAVIORAL_PROBE,
        probeId: `bytes-${index}`,
        first: maximalFixture,
        second: { ...maximalFixture, key: `second-${index}` },
        firstCrossInsert: { ...maximalFixture, key: `first-cross-${index}` },
        secondCrossInsert: { ...maximalFixture, key: `second-cross-${index}` },
    }));
    expect(
        outcomes(
            await proveBehavioralRlsIsolation(
                unreachableDatabase,
                behavioralPlan(oversizedBytes),
                BEHAVIORAL_SURFACE,
                new AbortController().signal,
            ),
        ),
    ).toEqual(["failed", "failed", "failed"]);
});

test("produces deterministic fail-closed evidence", async () => {
    const first = await proveBehavioralRlsIsolation(
        unreachableDatabase,
        behavioralPlan([]),
        BEHAVIORAL_SURFACE,
        new AbortController().signal,
    );
    const second = await proveBehavioralRlsIsolation(
        unreachableDatabase,
        behavioralPlan([]),
        BEHAVIORAL_SURFACE,
        new AbortController().signal,
    );
    expect(first.environment.observationDigest).toBe(second.environment.observationDigest);
    expect(first.reads.observationDigest).toBe(second.reads.observationDigest);
    expect(first.writes.observationDigest).toBe(second.writes.observationDigest);
});

function outcomes(proof: Awaited<ReturnType<typeof proveBehavioralRlsIsolation>>) {
    return [proof.environment.outcome, proof.reads.outcome, proof.writes.outcome];
}

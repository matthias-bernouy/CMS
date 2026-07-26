import { describe, expect, test } from "bun:test";
import {
    assertVerificationJobResultReplay,
    identifyVerificationJobResult,
    parseVerificationJobResult,
    validateVerificationJobResult,
    validateVerificationJobResultForAdmission,
} from "../../../src/exports/index";
import { DIGEST_A } from "../fixtures";
import { ATTEMPT, admissionSnapshot, jobResult, policySnapshot } from "./controlFixtures";

describe("verification job result document", () => {
    test("does not trust a worker-wide pass or worker-controlled suite source and requirement flags", async () => {
        const fixture = await resultFixture();
        await expect(validateVerificationJobResult({ ...fixture.result, passed: true })).rejects.toThrow(
            /passed.*not an allowed field/,
        );
        await expect(
            validateVerificationJobResult({
                ...fixture.result,
                results: [{ ...fixture.result.results[0]!, source: "platform", required: true }],
            }),
        ).rejects.toThrow(/source.*not an allowed field/);
    });

    test("requires bounded redacted diagnostics, digest evidence, and a self-identifying environment", async () => {
        const fixture = await resultFixture();
        const base = fixture.result.results[0]!;
        await expect(
            validateVerificationJobResult({
                ...fixture.result,
                results: [
                    {
                        ...base,
                        diagnostics: [{ code: "failure", message: "secret", redacted: false }],
                    },
                ],
            }),
        ).rejects.toThrow(/redacted.*must be true/);
        await expect(
            validateVerificationJobResult({
                ...fixture.result,
                results: [
                    {
                        ...base,
                        diagnostics: [{ code: "failure", message: "x".repeat(16_385), redacted: true }],
                    },
                ],
            }),
        ).rejects.toThrow(/16384 UTF-8 bytes/);
        await expect(
            validateVerificationJobResult({
                ...fixture.result,
                results: [{ ...base, evidenceDigests: ["not-a-digest"] }],
            }),
        ).rejects.toThrow(/lowercase SHA-256/);
        await expect(
            validateVerificationJobResult({
                ...fixture.result,
                environment: { ...fixture.result.environment, digest: DIGEST_A },
            }),
        ).rejects.toThrow(/canonical environment versions/);
    });

    test("enforces the server policy for retries and cache hits", async () => {
        const fixture = await resultFixture();
        await expect(
            validateVerificationJobResultForAdmission(
                {
                    ...fixture.result,
                    results: fixture.result.results.map((result) => ({ ...result, attempts: 4 })),
                },
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exceeds the admission retry policy/);
        await expect(
            validateVerificationJobResultForAdmission(
                {
                    ...fixture.result,
                    results: fixture.result.results.map((result) => ({
                        ...result,
                        outcome: "failed" as const,
                        cacheHit: true,
                    })),
                },
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/cache policy/);
    });

    test("makes exact canonical replays idempotent and rejects divergent replays", async () => {
        const fixture = await resultFixture();
        const reordered = {
            ...fixture.result,
            results: fixture.result.results.toReversed(),
            environment: { ...fixture.result.environment, versions: fixture.result.environment.versions.toReversed() },
        };
        const first = await identifyVerificationJobResult(fixture.result);
        const replay = await assertVerificationJobResultReplay(fixture.result, reordered);

        expect(replay.digest).toBe(first.digest);
        await expect(
            assertVerificationJobResultReplay(fixture.result, {
                ...fixture.result,
                results: fixture.result.results.map((result, index) =>
                    index === 0 ? { ...result, durationMs: result.durationMs + 1 } : result,
                ),
            }),
        ).rejects.toThrow(/diverges/);
    });

    test("uses strict JSON parsing for worker responses", async () => {
        const fixture = await resultFixture();
        const source = JSON.stringify(fixture.result).replace('"jobId":"job-1"', '"jobId":"job-1","jobId":"job-2"');
        await expect(parseVerificationJobResult(source)).rejects.toThrow(/duplicate property/);
    });
});

async function resultFixture() {
    const policy = await policySnapshot();
    const admission = await admissionSnapshot(policy);
    const result = await jobResult(policy, admission);
    return { policy, admission, result };
}

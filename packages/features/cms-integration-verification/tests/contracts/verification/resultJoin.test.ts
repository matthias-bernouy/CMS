import { describe, expect, test } from "bun:test";
import {
    identifyReleaseVerificationPlan,
    planReleaseVerification,
    validateVerificationJobResult,
    validateVerificationJobResultForAdmission,
    type VerificationJobResultV1,
} from "../../../src/exports/index";
import { DIGEST_A, DIGEST_B } from "../fixtures";
import { ATTEMPT, admissionSnapshot, jobResult, policySnapshot } from "./controlFixtures";

describe("verification job result", () => {
    test("accepts only a result bound to the exact policy, admission, runner, and fenced lease", async () => {
        const fixture = await resultFixture();
        await expect(
            validateVerificationJobResultForAdmission(fixture.result, fixture.admission, fixture.policy, ATTEMPT),
        ).resolves.toMatchObject({ result: { candidateId: "candidate-1", fencingToken: 3 } });

        const attempts: readonly Readonly<{ value: VerificationJobResultV1; error: RegExp }>[] = [
            { value: { ...fixture.result, candidateId: "candidate-2" }, error: /admission candidate/ },
            { value: { ...fixture.result, jobId: "job-2" }, error: /fenced attempt/ },
            { value: { ...fixture.result, attemptId: "attempt-2" }, error: /fenced attempt/ },
            { value: { ...fixture.result, fencingToken: 4 }, error: /fenced attempt/ },
            {
                value: {
                    ...fixture.result,
                    runner: { ...fixture.result.runner, imageDigest: `sha256:${DIGEST_B}` },
                },
                error: /exact selected runner/,
            },
        ];
        for (const attempt of attempts) {
            await expect(
                validateVerificationJobResultForAdmission(attempt.value, fixture.admission, fixture.policy, ATTEMPT),
            ).rejects.toThrow(attempt.error);
        }
        for (const key of Object.keys(fixture.result.bindings) as (keyof VerificationJobResultV1["bindings"])[]) {
            const current = fixture.result.bindings[key];
            const replacement =
                typeof current === "string"
                    ? current === DIGEST_A
                        ? DIGEST_B
                        : DIGEST_A
                    : current.length === 1 && current[0] === DIGEST_A
                      ? [DIGEST_B]
                      : [DIGEST_A];
            await expect(
                validateVerificationJobResultForAdmission(
                    {
                        ...fixture.result,
                        bindings: {
                            ...fixture.result.bindings,
                            [key]: replacement,
                        } as VerificationJobResultV1["bindings"],
                    },
                    fixture.admission,
                    fixture.policy,
                    ATTEMPT,
                ),
            ).rejects.toThrow(/canonical admission inputs/);
        }
    });

    test("rejects omitted, extra, or duplicate planned suites", async () => {
        const fixture = await resultFixture();
        const omitted = { ...fixture.result, results: fixture.result.results.slice(1) };
        const extra = {
            ...fixture.result,
            results: [...fixture.result.results, { ...fixture.result.results[0]!, suiteId: "unplanned" }],
        };
        const duplicate = {
            ...fixture.result,
            results: [...fixture.result.results, fixture.result.results[0]!],
        };
        await expect(
            validateVerificationJobResultForAdmission(omitted, fixture.admission, fixture.policy, ATTEMPT),
        ).rejects.toThrow(/every and only planned suite/);
        await expect(
            validateVerificationJobResultForAdmission(extra, fixture.admission, fixture.policy, ATTEMPT),
        ).rejects.toThrow(/every and only planned suite/);
        await expect(validateVerificationJobResult(duplicate)).rejects.toThrow(/duplicate/);
    });

    test("rejects baseline package, revision, or content substitution after admission", async () => {
        const fixture = await resultFixture();
        const baseline = fixture.admission.reviewedBaselines[0]!;
        for (const replacement of [
            { ...baseline, packageDigest: DIGEST_A },
            { ...baseline, revisionId: "baseline-2" },
            { ...baseline, baselineDigest: DIGEST_A },
        ]) {
            await expect(
                validateVerificationJobResultForAdmission(
                    fixture.result,
                    { ...fixture.admission, reviewedBaselines: [replacement] },
                    fixture.policy,
                    ATTEMPT,
                ),
            ).rejects.toThrow(/canonical admission inputs/);
        }
    });

    test("binds the exact release plan and every immutable upgrade package digest", async () => {
        const policy = await policySnapshot();
        const baseAdmission = await admissionSnapshot(policy);
        const releaseVerificationPlan = await identifyReleaseVerificationPlan(
            planReleaseVerification({
                baselines: [{ version: "1.0.0", packageDigest: DIGEST_A, resilienceKey: DIGEST_B }],
                hasMigrations: false,
            }),
        );
        const admission = {
            ...baseAdmission,
            releaseVerificationPlan: {
                digest: releaseVerificationPlan.digest,
                plan: releaseVerificationPlan.plan,
            },
        };
        const result = await jobResult(policy, admission);

        await expect(
            validateVerificationJobResultForAdmission(result, admission, policy, ATTEMPT),
        ).resolves.toBeDefined();
        const missingBaselines = {
            ...result,
            bindings: { ...result.bindings, upgradeBaselineDigests: [] },
        };
        await expect(
            validateVerificationJobResultForAdmission(missingBaselines, admission, policy, ATTEMPT),
        ).rejects.toThrow(/canonical admission inputs/u);
        const { upgradeBaselineDigests: _, ...missingPair } = result.bindings;
        await expect(validateVerificationJobResult({ ...result, bindings: missingPair })).rejects.toThrow(
            /release verification plan and upgrade baselines together/u,
        );
    });
});

async function resultFixture() {
    const policy = await policySnapshot();
    const admission = await admissionSnapshot(policy);
    const result = await jobResult(policy, admission);
    return { policy, admission, result };
}

import { describe, expect, test } from "bun:test";
import {
    identifyReleaseAdmissionPolicySnapshot,
    parseReleaseAdmissionPolicySnapshot,
    validateReleaseAdmissionPolicySnapshot,
} from "../../../src/exports/index";
import { DIGEST_D, DIGEST_E, DIGEST_F, IMAGE_B, policySnapshot } from "./controlFixtures";

describe("release admission policy snapshot", () => {
    test("canonically binds every global evaluator, runner, suite, proof, retry, cache, and migration rule", async () => {
        const policy = await policySnapshot();
        const shuffled = {
            ...policy,
            approvedRunners: policy.approvedRunners.toReversed(),
            platformRequiredSuites: policy.platformRequiredSuites.toReversed(),
            findingResolutionRules: policy.findingResolutionRules.map((rule) => ({
                ...rule,
                proofTypes: rule.proofTypes.toReversed(),
                producers: rule.producers.toReversed(),
            })),
            migrationEvidence: {
                ...policy.migrationEvidence,
                requiredForReleaseLevels: policy.migrationEvidence.requiredForReleaseLevels.toReversed(),
                requiredChecks: policy.migrationEvidence.requiredChecks.toReversed(),
            },
        };
        const first = await identifyReleaseAdmissionPolicySnapshot(policy);
        const second = await identifyReleaseAdmissionPolicySnapshot(shuffled);

        expect(first.digest).toBe(second.digest);
        expect(first.canonicalBytes).toEqual(second.canonicalBytes);
        expect(first.snapshot.approvedRunners.map((runner) => runner.name)).toEqual(["cms-deno", "cms-postgres"]);
        expect(first.snapshot.migrationEvidence.requiredChecks).toEqual([
            "equivalence",
            "fresh-install",
            "migrated-state",
        ]);
    });

    test("requires exact SemVer policies and digest-pinned approved images", async () => {
        const policy = await policySnapshot();
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...policy,
                staticEvaluator: { ...policy.staticEvaluator, version: "^2.0.0" },
            }),
        ).rejects.toThrow(/exact SemVer/);
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...policy,
                approvedRunners: [{ ...policy.approvedRunners[0]!, imageDigest: "postgres:16" }],
            }),
        ).rejects.toThrow(/pinned sha256 image digest/);
    });

    test("rejects suites and finding proofs assigned to unapproved runners", async () => {
        const policy = await policySnapshot();
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...policy,
                platformRequiredSuites: [
                    {
                        ...policy.platformRequiredSuites[0]!,
                        runner: { name: "rogue", version: "1.0.0", imageDigest: IMAGE_B },
                    },
                ],
            }),
        ).rejects.toThrow(/exact approved runner/);
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...policy,
                findingResolutionRules: policy.findingResolutionRules.map((rule) => ({
                    ...rule,
                    runnerDigests: [DIGEST_F],
                })),
            }),
        ).rejects.toThrow(/approved runner identity/);
    });

    test("fails closed for incoherent retry and cache policies", async () => {
        const policy = await policySnapshot();
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...policy,
                retry: { maximumAttempts: 1, retryableOutcomes: ["infrastructure-failure"] },
            }),
        ).rejects.toThrow(/disable retries/);
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...policy,
                cache: { mode: "passed-only", minimumConcordantRuns: 1, maximumAgeSeconds: 3_600 },
            }),
        ).rejects.toThrow(/two concordant runs/);
    });

    test("canonicalizes unique approved migration environments while reading historical omissions", async () => {
        const historical = await policySnapshot();
        const parsedHistorical = await validateReleaseAdmissionPolicySnapshot(historical);
        expect(parsedHistorical.migrationEvidence.approvedEnvironmentDigests).toBeUndefined();
        const pinned = {
            ...historical,
            migrationEvidence: {
                ...historical.migrationEvidence,
                approvedEnvironmentDigests: [DIGEST_E, DIGEST_D],
            },
        };
        const parsed = await validateReleaseAdmissionPolicySnapshot(pinned);

        expect(parsed.migrationEvidence.approvedEnvironmentDigests).toEqual([DIGEST_D, DIGEST_E]);
        await expect(
            validateReleaseAdmissionPolicySnapshot({
                ...pinned,
                migrationEvidence: {
                    ...pinned.migrationEvidence,
                    approvedEnvironmentDigests: [DIGEST_D, DIGEST_D],
                },
            }),
        ).rejects.toThrow(/approvedEnvironmentDigests.*duplicate/);
    });

    test("uses strict JSON and a closed policy shape", async () => {
        const policy = await policySnapshot();
        await expect(validateReleaseAdmissionPolicySnapshot({ ...policy, authorOverride: true })).rejects.toThrow(
            /authorOverride.*not an allowed field/,
        );
        const duplicate = JSON.stringify(policy).replace(
            '"identity":{"name":"global-admission","version":"1.4.0"}',
            '"identity":{"name":"global-admission","version":"1.4.0"},"identity":{}',
        );
        await expect(parseReleaseAdmissionPolicySnapshot(duplicate)).rejects.toThrow(/duplicate property/);
    });
});

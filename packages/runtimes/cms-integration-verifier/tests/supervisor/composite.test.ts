import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    buildBehavioralRlsPlan,
    identifyPlatformVerificationSuiteDefinition,
    identifyReleaseAdmissionPolicySnapshot,
    identifyReleaseVerificationPlan,
    planReleaseVerification,
    RELEASE_RUNTIME_PLATFORM_VERIFICATION_SUITE_V1,
} from "@bernouy/cms-integration-verification";
import {
    createCompositeVerificationSandbox,
    runPostgresPlatformVerification,
    type VerificationSandbox,
    type VerificationSandboxInput,
} from "../../src";
import { releaseRuntimeEvidence } from "../../src/sandbox/release/evidence";
import { createPostgresPlatformVerificationAdapter, postgresPlatformInputFixture } from "../fixtures/postgresAdapter";
import { validSandboxResult } from "../fixtures/result";

describe("composite remote verification sandbox", () => {
    test("joins PostgreSQL and full-stack evidence before validating the original admission", async () => {
        const input = await compositeInput();
        const platform = sandbox(async (exact, signal) => {
            return await runPostgresPlatformVerification(exact, createPostgresPlatformVerificationAdapter(), signal);
        });
        const releaseRuntime = sandbox(async (exact) => await runtimeResult(exact));

        const result = await createCompositeVerificationSandbox({ platform, releaseRuntime }).run(
            input,
            new AbortController().signal,
        );

        expect(result.verification.results).toHaveLength(input.workload.admission.suites.length);
        expect(
            result.verification.results
                .find(({ suiteId }) => suiteId === "platform-release-runtime")
                ?.platformEvidence?.checks.map(({ checkId }) => checkId),
        ).toEqual([
            "business-fixtures",
            "crash-recovery",
            "exact-release-plan",
            "fresh-install",
            "historical-upgrades",
        ]);
        expect(result.verification.environment.versions.map(({ name }) => name)).toEqual([
            "postgres",
            "release-runtime-contract",
        ]);
    });

    test("fails closed when the dedicated runtime omits its mandatory proof", async () => {
        const input = await compositeInput();
        const empty = sandbox(async (exact) => {
            const result = await validSandboxResult(exact);
            return { ...result, verification: { ...result.verification, results: [] } };
        });

        await expect(
            createCompositeVerificationSandbox({ platform: empty, releaseRuntime: empty }).run(
                input,
                new AbortController().signal,
            ),
        ).rejects.toThrow(/every and only planned suite/u);
    });

    test("aborts the sibling sandbox when either isolated proof fails", async () => {
        const input = await compositeInput();
        let runtimeAborted = false;
        const platform = sandbox(async () => {
            throw new Error("platform unavailable");
        });
        const releaseRuntime = sandbox(
            async (_exact, signal) =>
                await new Promise((_resolve, reject) => {
                    signal.addEventListener(
                        "abort",
                        () => {
                            runtimeAborted = true;
                            reject(signal.reason);
                        },
                        { once: true },
                    );
                }),
        );

        await expect(
            createCompositeVerificationSandbox({ platform, releaseRuntime }).run(input, new AbortController().signal),
        ).rejects.toThrow("platform unavailable");
        expect(runtimeAborted).toBe(true);
    });
});

async function compositeInput(): Promise<VerificationSandboxInput> {
    const base = await postgresPlatformInputFixture();
    const runtimeDefinition = await identifyPlatformVerificationSuiteDefinition(
        RELEASE_RUNTIME_PLATFORM_VERIFICATION_SUITE_V1,
    );
    const policy = {
        ...base.workload.policy,
        platformRequiredSuites: [
            ...base.workload.policy.platformRequiredSuites,
            {
                suiteId: runtimeDefinition.definition.suiteId,
                suiteDigest: runtimeDefinition.digest,
                runner: base.workload.admission.selectedRunner,
                applicability: runtimeDefinition.definition.applicability,
            },
        ].toSorted((left, right) => left.suiteId.localeCompare(right.suiteId)),
    };
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(policy)).digest;
    const { candidateId: _candidateId, ...behavioralTarget } = base.workload.admission.candidate;
    const behavioralRlsPlan = await buildBehavioralRlsPlan({
        verification: base.workload.verification,
        target: behavioralTarget,
        policyDigest,
    });
    const releasePlan = await identifyReleaseVerificationPlan(
        planReleaseVerification({ baselines: [], hasMigrations: false }),
    );
    return {
        ...base,
        workload: {
            ...base.workload,
            policy,
            behavioralRlsPlan: { digest: behavioralRlsPlan.digest, plan: behavioralRlsPlan.plan },
            admission: {
                ...base.workload.admission,
                policyDigest,
                behavioralRlsPlan: { digest: behavioralRlsPlan.digest, plan: behavioralRlsPlan.plan },
                releaseVerificationPlan: { digest: releasePlan.digest, plan: releasePlan.plan },
                suites: [
                    ...base.workload.admission.suites,
                    {
                        suiteId: runtimeDefinition.definition.suiteId,
                        source: "platform" as const,
                        contentDigest: runtimeDefinition.digest,
                        applicable: true,
                    },
                ].toSorted((left, right) => left.suiteId.localeCompare(right.suiteId)),
            },
        },
    };
}

function sandbox(run: VerificationSandbox["run"]): VerificationSandbox {
    return { identity: createPostgresPlatformVerificationAdapterIdentity(), run };
}

function createPostgresPlatformVerificationAdapterIdentity() {
    return { name: "cms-postgres", version: "1.2.3", imageDigest: `sha256:${"a".repeat(64)}` } as const;
}

async function runtimeResult(input: VerificationSandboxInput) {
    const generic = await validSandboxResult(input);
    const binding = input.workload.admission.releaseVerificationPlan!;
    const suiteDigest = input.workload.admission.suites.find(
        ({ suiteId }) => suiteId === "platform-release-runtime",
    )!.contentDigest;
    const evidence = await releaseRuntimeEvidence(suiteDigest, binding.digest, {
        scenarios: [{ scenario: { type: "fresh-install" }, outcome: "passed" }],
    });
    return {
        ...generic,
        verification: {
            ...generic.verification,
            environment: {
                digest: "a".repeat(64),
                versions: [{ name: "release-runtime-contract", version: "1.0.0" }],
            },
            results: [
                {
                    suiteId: "platform-release-runtime",
                    outcome: "passed" as const,
                    durationMs: 1,
                    attempts: 1,
                    cacheHit: false,
                    evidenceDigests: [await sha256Hex(canonicalJsonBytes(evidence))],
                    diagnostics: [],
                    platformEvidence: evidence,
                },
            ],
        },
    };
}

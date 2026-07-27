import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    BEHAVIORAL_RLS_PLAN_SCHEMA,
    BEHAVIORAL_RLS_PLATFORM_SUITE_ID,
    identifyBehavioralRlsPlan,
    identifyReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import { parseCanonicalVerificationSandboxInput } from "../../src/sandbox/childProtocol";
import { parseExactWorkload } from "../../src/protocol";
import type { CandidateStatusProjection } from "../../src";
import { postgresPlatformInputFixture } from "../fixtures/postgresAdapter";

describe("behavioral RLS plan transport", () => {
    test("carries the exact admission plan through repository and child-process boundaries", async () => {
        const input = await behavioralInput();
        const candidate = status(input);
        const { attempt: _attempt, ...repositoryWorkload } = input.workload;

        await expect(parseExactWorkload(repositoryWorkload, candidate)).resolves.toMatchObject({
            behavioralRlsPlan: { digest: input.workload.behavioralRlsPlan?.digest },
        });
        await expect(
            parseCanonicalVerificationSandboxInput(canonicalJsonBytes(input), 16 * 1_024 * 1_024),
        ).resolves.toMatchObject({
            workload: { behavioralRlsPlan: { digest: input.workload.behavioralRlsPlan?.digest } },
        });
    });

    test("rejects omission and substitution on both transport boundaries", async () => {
        const input = await behavioralInput();
        const candidate = status(input);
        const { attempt: _attempt, behavioralRlsPlan: _omitted, ...withoutPlan } = input.workload;
        await expect(parseExactWorkload(withoutPlan, candidate)).rejects.toThrow(/invalid exact verification workload/);

        const substitutedRepositoryWorkload = {
            ...withoutPlan,
            behavioralRlsPlan: { ...input.workload.behavioralRlsPlan!, digest: "f".repeat(64) },
        };
        await expect(parseExactWorkload(substitutedRepositoryWorkload, candidate)).rejects.toThrow(
            /invalid exact verification workload/,
        );
        const substituted = { ...input.workload, behavioralRlsPlan: substitutedRepositoryWorkload.behavioralRlsPlan };
        await expect(
            parseCanonicalVerificationSandboxInput(
                canonicalJsonBytes({ ...input, workload: substituted }),
                16 * 1_024 * 1_024,
            ),
        ).rejects.toThrow(/exact admission plan/);
    });
});

async function behavioralInput() {
    const input = await postgresPlatformInputFixture();
    const suiteDigest = "e".repeat(64);
    const policy = {
        ...input.workload.policy,
        platformRequiredSuites: [
            ...input.workload.policy.platformRequiredSuites,
            {
                suiteId: BEHAVIORAL_RLS_PLATFORM_SUITE_ID,
                suiteDigest,
                runner: input.workload.admission.selectedRunner,
                applicability: "data-api-schemas" as const,
            },
        ].toSorted((left, right) => left.suiteId.localeCompare(right.suiteId)),
    };
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(policy)).digest;
    const candidate = input.workload.admission.candidate;
    const identified = await identifyBehavioralRlsPlan({
        schema: BEHAVIORAL_RLS_PLAN_SCHEMA,
        target: {
            kind: candidate.kind,
            version: candidate.version,
            candidateDigest: candidate.candidateDigest,
            packageDigest: candidate.packageDigest,
            verificationDigest: candidate.verificationDigest,
        },
        policyDigest,
        probes: [],
    });
    const binding = { digest: identified.digest, plan: identified.plan };
    return {
        ...input,
        workload: {
            ...input.workload,
            policy,
            behavioralRlsPlan: binding,
            admission: {
                ...input.workload.admission,
                policyDigest,
                suites: [
                    ...input.workload.admission.suites,
                    {
                        suiteId: BEHAVIORAL_RLS_PLATFORM_SUITE_ID,
                        source: "platform" as const,
                        contentDigest: suiteDigest,
                        applicable: false,
                    },
                ].toSorted((left, right) => left.suiteId.localeCompare(right.suiteId)),
                behavioralRlsPlan: binding,
            },
        },
    };
}

function status(input: Awaited<ReturnType<typeof postgresPlatformInputFixture>>): CandidateStatusProjection {
    const candidate = input.workload.admission.candidate;
    return {
        candidateId: candidate.candidateId,
        revision: 2,
        status: "queued",
        kind: candidate.kind,
        version: candidate.version,
        candidateDigest: candidate.candidateDigest,
        packageDigest: candidate.packageDigest,
        verificationDigest: candidate.verificationDigest,
        createdAt: "2026-07-26T12:00:00.000Z",
        updatedAt: "2026-07-26T12:00:00.000Z",
        expiresAt: "2026-07-26T13:00:00.000Z",
        attemptCount: 0,
    };
}

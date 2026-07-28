import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
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
    if (!input.workload.behavioralRlsPlan) {
        throw new Error("Production platform fixture did not bind its behavioral RLS plan");
    }
    return input;
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

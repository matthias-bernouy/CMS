import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes, computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import { identifyReleaseVerificationPlan, planReleaseVerification } from "@bernouy/cms-integration-verification";
import { parseCanonicalVerificationSandboxInput, parseExactWorkload } from "../../src";
import { queuedCandidate, workloadFixture } from "../fixtures/workload";

describe("server-owned release verification plan transport", () => {
    test("carries the exact plan and every immutable package through both worker boundaries", async () => {
        const fixture = await releasePlanFixture();

        const parsed = await parseExactWorkload(fixture.workload, fixture.candidate);
        const sandboxInput = {
            workload: {
                ...parsed,
                attempt: { jobId: "job-1", attemptId: "attempt-1", fencingToken: 1 },
            },
            database: {
                databaseId: "database-1",
                connectionUri: "postgresql://user:database-secret@postgres:5432/release_plan",
            },
        };

        expect(parsed.admission.releaseVerificationPlan?.digest).toBe(fixture.planDigest);
        expect(parsed.upgradePackages).toEqual(fixture.workload.upgradePackages);
        expect(await parseCanonicalVerificationSandboxInput(canonicalJsonBytes(sandboxInput), 4 * 1_048_576)).toEqual(
            sandboxInput,
        );
    });

    test("rejects omitted packages and fixture metadata not bound by the verification bundle", async () => {
        const fixture = await releasePlanFixture();
        await expect(
            parseExactWorkload({ ...fixture.workload, upgradePackages: [] }, fixture.candidate),
        ).rejects.toMatchObject({ kind: "invalid-response" });

        const mismatched = await identifyReleaseVerificationPlan(
            planReleaseVerification({
                baselines: fixture.workload.admission.releaseVerificationPlan!.plan.baselines,
                fixtures: [{ name: "undeclared business state", from: "^1.0.0" }],
                hasMigrations: false,
            }),
        );
        await expect(
            parseExactWorkload(
                {
                    ...fixture.workload,
                    admission: {
                        ...fixture.workload.admission,
                        releaseVerificationPlan: { digest: mismatched.digest, plan: mismatched.plan },
                    },
                },
                fixture.candidate,
            ),
        ).rejects.toMatchObject({ kind: "invalid-response" });
    });
});

async function releasePlanFixture() {
    const base = await workloadFixture();
    const envelope = {
        ...base.package,
        version: "1.0.0",
        files: {
            ...base.package.files,
            "definition.json": {
                encoding: "utf8" as const,
                content: JSON.stringify({ kind: "example", version: "1.0.0" }),
            },
        },
    };
    const packageDigest = await computeIntegrationPackageDigest(envelope);
    const identified = await identifyReleaseVerificationPlan(
        planReleaseVerification({
            baselines: [{ version: "1.0.0", packageDigest, resilienceKey: "1".repeat(64) }],
            hasMigrations: false,
        }),
    );
    const workload = {
        ...base,
        admission: {
            ...base.admission,
            releaseVerificationPlan: { digest: identified.digest, plan: identified.plan },
        },
        upgradePackages: [{ kind: "example", version: "1.0.0", packageDigest, envelope }],
    };
    return {
        workload,
        candidate: await queuedCandidate(),
        planDigest: identified.digest,
    };
}

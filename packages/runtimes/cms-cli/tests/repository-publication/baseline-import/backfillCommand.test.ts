import { describe, expect, test } from "bun:test";
import type { OfficialRepositoryBootstrapPlan } from "@bernouy/cms-integration-registry";
import { runRepositoryVerificationBackfillCommand } from "../../../src/repositoryPublication/maintenance/backfillCommand";
import { officialVerificationBackfills } from "./fixtures";

const COMMAND = "backfill-official-verification";

describe("official verification backfill command", () => {
    test("dry-run validates the complete evidence plan without credentials", async () => {
        const entries = (await officialVerificationBackfills()).slice(0, 2);
        const output: string[] = [];
        const exit = await runRepositoryVerificationBackfillCommand([COMMAND, "--dry-run"], {
            environment: {},
            buildPlan: async () => plan(entries),
            readToken: async () => Promise.reject(new Error("must not read")),
            backfill: async () => Promise.reject(new Error("must not backfill")),
            write: (line) => output.push(line),
            writeError: (line) => output.push(`ERROR ${line}`),
        });

        expect(exit).toBe(0);
        expect(output[0]).toBe("Official verification backfill plan: 2 version(s)");
        expect(output[1]).toMatch(/^PLAN .+@1\.0\.0 [a-f0-9]{64} [a-f0-9]{64}$/);
        expect(output.at(-1)).toBe("Summary: planned=2 backfilled=0 unchanged=0 failed=0 skipped=0");
    });

    test("backfills sequentially through the maintenance capability", async () => {
        const entries = (await officialVerificationBackfills()).slice(0, 2);
        const attempts: string[] = [];
        const output: string[] = [];
        const outcomes = ["backfilled", "unchanged"] as const;
        let index = 0;
        const exit = await runRepositoryVerificationBackfillCommand(
            [COMMAND, "--url=https://repository.internal/maintenance", "--token-file=/run/secrets/token"],
            {
                environment: {},
                buildPlan: async () => plan(entries),
                readToken: async () => "maintenance-token",
                backfill: async (config, entry) => {
                    const target = entry.verification.envelope.target;
                    expect(config.token).toBe("maintenance-token");
                    attempts.push(`${target.kind}@${target.version}`);
                    return {
                        outcome: outcomes[index++],
                        operationId: `operation-${index}`,
                        ...target,
                        verificationDigest: entry.verification.digest,
                        decisionRevisionId: entry.decision.decisionId,
                        decisionDigest: "f".repeat(64),
                    };
                },
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(0);
        expect(attempts).toHaveLength(2);
        expect(output.at(-1)).toBe("Summary: planned=2 backfilled=1 unchanged=1 failed=0 skipped=0");
    });

    test("stops after a sanitized failure", async () => {
        const entries = (await officialVerificationBackfills()).slice(0, 2);
        const output: string[] = [];
        const exit = await runRepositoryVerificationBackfillCommand(
            [COMMAND, "--url=https://repository.internal/maintenance", "--token-file=/run/secrets/token"],
            {
                environment: {},
                buildPlan: async () => plan(entries),
                readToken: async () => "maintenance-token",
                backfill: async () => ({
                    outcome: "failed",
                    reason: "rejected",
                    status: 409,
                    code: "verification_backfill_conflict",
                }),
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(1);
        expect(output.some((line) => /^FAILED .+ reason=rejected status=409 code=/u.test(line))).toBe(true);
        expect(output.at(-1)).toBe("Summary: planned=2 backfilled=0 unchanged=0 failed=1 skipped=1");
        expect(output.join("\n")).not.toContain("maintenance-token");
        expect(output.join("\n")).not.toContain("repository.internal");
    });
});

function plan(
    verificationBackfills: OfficialRepositoryBootstrapPlan["verificationBackfills"],
): OfficialRepositoryBootstrapPlan {
    return {
        schema: "cms.integration.official-bootstrap-plan.v1",
        packages: [],
        reviewedSchemaBaselines: [],
        verificationBackfills,
    };
}

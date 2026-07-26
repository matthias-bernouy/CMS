import { describe, expect, test } from "bun:test";
import { runRepositoryBaselineImportCommand } from "../../../src/repositoryPublication/baselineImportCommand";
import { officialBaseline } from "./fixtures";

const BASELINE_A = officialBaseline("alpha");
const BASELINE_B = officialBaseline("beta");
const COMMAND = "import-official-schema-baselines";

describe("official schema baseline import command", () => {
    test("dry-run validates the joint package/evidence plan without credentials", async () => {
        const output: string[] = [];
        const exit = await runRepositoryBaselineImportCommand([COMMAND, "--dry-run"], {
            environment: {},
            buildPlan: async () => plan(),
            readToken: async () => Promise.reject(new Error("must not read")),
            importBaseline: async () => Promise.reject(new Error("must not import")),
            write: (line) => output.push(line),
            writeError: (line) => output.push(`ERROR ${line}`),
        });

        expect(exit).toBe(0);
        expect(output).toEqual([
            "Official reviewed schema baseline import plan: 2 baseline(s)",
            expect.stringMatching(/^PLAN alpha@1\.0\.0 primary a{64}$/),
            expect.stringMatching(/^PLAN beta@1\.0\.0 primary a{64}$/),
            "Summary: planned=2 imported=0 unchanged=0 failed=0 skipped=0",
        ]);
    });

    test("imports sequentially through the maintenance capability", async () => {
        const attempts: string[] = [];
        const output: string[] = [];
        const outcomes = ["imported", "unchanged"] as const;
        let index = 0;
        const exit = await runRepositoryBaselineImportCommand(
            [COMMAND, "--url=https://repository.internal/maintenance", "--token-file=/run/secrets/token"],
            {
                environment: {},
                buildPlan: async () => plan(),
                readToken: async () => "maintenance-token",
                importBaseline: async (config, baseline) => {
                    expect(config.token).toBe("maintenance-token");
                    attempts.push(`${baseline.kind}@${baseline.version}`);
                    return {
                        outcome: outcomes[index++],
                        operationId: `operation-${index}`,
                        baselineDigest: "f".repeat(64),
                        currentRevisionId: baseline.reportId,
                    };
                },
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(0);
        expect(attempts).toEqual(["alpha@1.0.0", "beta@1.0.0"]);
        expect(output.at(-1)).toBe("Summary: planned=2 imported=1 unchanged=1 failed=0 skipped=0");
    });

    test("stops after a sanitized failure and does not expose configuration secrets", async () => {
        const output: string[] = [];
        const exit = await runRepositoryBaselineImportCommand(
            [COMMAND, "--url=https://repository.internal/maintenance", "--token-file=/run/secrets/token"],
            {
                environment: {},
                buildPlan: async () => plan(),
                readToken: async () => "maintenance-token",
                importBaseline: async () => ({
                    outcome: "failed",
                    reason: "rejected",
                    status: 422,
                    code: "reviewed_schema_baseline_import_unapproved",
                }),
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(1);
        expect(output).toContain(
            "FAILED alpha@1.0.0 reason=rejected status=422 code=reviewed_schema_baseline_import_unapproved",
        );
        expect(output.at(-1)).toBe("Summary: planned=2 imported=0 unchanged=0 failed=1 skipped=1");
        expect(output.join("\n")).not.toContain("maintenance-token");
        expect(output.join("\n")).not.toContain("repository.internal");
    });
});

function plan() {
    return {
        schema: "cms.integration.official-bootstrap-plan.v1" as const,
        packages: [],
        reviewedSchemaBaselines: [BASELINE_A, BASELINE_B],
        verificationBackfills: [],
    };
}

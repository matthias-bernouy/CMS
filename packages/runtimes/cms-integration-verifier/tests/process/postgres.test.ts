import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { validateVerificationJobResultForAdmission } from "@bernouy/cms-integration-verification";
import {
    runPostgresInstallAndReapply,
    type PostgresInstallAndReapplyAdapter,
    type VerificationSandboxInput,
} from "../../src";
import { DIGEST_A, DIGEST_B, DIGEST_C } from "../fixtures/contracts";
import { sandboxInputFixture } from "../fixtures/workload";
import { processSandboxFixture } from "./support";

describe("PostgreSQL install-and-reapply sandbox program", () => {
    test("runs through the canonical child-process executable with a prebuilt adapter module", async () => {
        const executable = join(import.meta.dir, "../../src/sandbox/postgresMain.ts");
        const adapterModule = join(import.meta.dir, "../fixtures/postgresAdapter.ts");
        const fixture = await processSandboxFixture("unused", {
            arguments: [executable, adapterModule, "platform-install"],
        });
        try {
            const result = await fixture.sandbox.run(await sandboxInputFixture(), new AbortController().signal);
            expect(result.results.find((suite) => suite.suiteId === "platform-install")?.outcome).toBe("passed");
            expect(result.results.find((suite) => suite.suiteId === "implementation")?.outcome).toBe("skipped");
        } finally {
            await fixture.cleanup();
        }
    });

    test("applies SQL twice to the same disposable database and reports only observed evidence", async () => {
        const input = await sandboxInputFixture();
        const calls: Array<Readonly<{ phase: string; database: VerificationSandboxInput["database"] }>> = [];
        const result = await runPostgresInstallAndReapply(
            input,
            adapter(DIGEST_A, (phase, database) => calls.push({ phase, database })),
            "platform-install",
            new AbortController().signal,
        );

        await expect(
            validateVerificationJobResultForAdmission(
                result,
                input.workload.admission,
                input.workload.policy,
                input.workload.attempt,
            ),
        ).resolves.toBeDefined();
        expect(calls.map((call) => call.phase)).toEqual(["install", "reapply"]);
        expect(calls[0]!.database).toBe(input.database);
        expect(calls[1]!.database).toBe(input.database);
        expect(result.results.find((suite) => suite.suiteId === "platform-install")?.outcome).toBe("passed");
        expect(result.results.find((suite) => suite.suiteId === "implementation")?.outcome).toBe("skipped");
    });

    test("fails the generated suite when reapplication changes the observed schema", async () => {
        const input = await sandboxInputFixture();
        let applications = 0;
        const result = await runPostgresInstallAndReapply(
            input,
            adapter(DIGEST_A, undefined, () => (++applications === 1 ? DIGEST_A : DIGEST_B)),
            "platform-install",
            new AbortController().signal,
        );

        const suite = result.results.find((entry) => entry.suiteId === "platform-install")!;
        expect(suite.outcome).toBe("failed");
        expect(suite.diagnostics).toEqual([
            expect.objectContaining({ code: "postgres-reapply-changed-schema", redacted: true }),
        ]);
    });

    test("propagates provisioning failures instead of fabricating a verification result", async () => {
        const input = await sandboxInputFixture();
        const failing: PostgresInstallAndReapplyAdapter = {
            async environmentVersions() {
                return [];
            },
            async applyPackageSql() {
                throw new Error("no external disposable database was provisioned");
            },
        };

        await expect(
            runPostgresInstallAndReapply(input, failing, "platform-install", new AbortController().signal),
        ).rejects.toThrow("no external disposable database was provisioned");
    });
});

function adapter(
    defaultSchemaDigest: string,
    onApply?: (phase: string, database: VerificationSandboxInput["database"]) => void,
    schemaDigest?: () => string,
): PostgresInstallAndReapplyAdapter {
    return {
        async environmentVersions() {
            return [{ name: "postgres", version: "16.4" }];
        },
        async applyPackageSql({ phase, database }) {
            onApply?.(phase, database);
            return {
                observedSchemaDigest: schemaDigest?.() ?? defaultSchemaDigest,
                evidenceDigest: phase === "install" ? DIGEST_B : DIGEST_C,
                durationMs: 5,
            };
        },
    };
}

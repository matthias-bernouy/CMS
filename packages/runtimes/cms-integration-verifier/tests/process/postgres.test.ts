import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
    PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    validateCandidateAdmissionJobResultForPlan,
} from "@bernouy/cms-integration-verification";
import {
    runPostgresPlatformVerification,
    type PostgresPlatformVerificationAdapter,
    type VerificationSandboxInput,
} from "../../src";
import { DIGEST_A } from "../fixtures/contracts";
import { postgresPlatformInputFixture } from "../fixtures/postgresAdapter";
import { processSandboxFixture } from "./support";

describe("PostgreSQL platform verification sandbox program", () => {
    test("runs through the canonical child-process executable with a prebuilt adapter module", async () => {
        const executable = join(import.meta.dir, "../../src/sandbox/postgresMain.ts");
        const adapterModule = join(import.meta.dir, "../fixtures/postgresAdapter.ts");
        const fixture = await processSandboxFixture("unused", { arguments: [executable, adapterModule] });
        try {
            const result = await fixture.sandbox.run(
                await postgresPlatformInputFixture(),
                new AbortController().signal,
            );
            expect(
                result.verification.results.find((suite) => suite.suiteId === "platform-package-materialization")
                    ?.outcome,
            ).toBe("passed");
            expect(
                result.verification.results.find((suite) => suite.suiteId === "platform-postgres-rls-shape")?.outcome,
            ).toBe("not-applicable");
            expect(result.verification.results.find((suite) => suite.suiteId === "implementation")?.outcome).toBe(
                "passed",
            );
        } finally {
            await fixture.cleanup();
        }
    });

    test("executes every exact platform and author suite without conflating their evidence", async () => {
        const input = await postgresPlatformInputFixture();
        const calls: VerificationSandboxInput["database"][] = [];
        const result = await runPostgresPlatformVerification(
            input,
            adapter((database) => calls.push(database)),
            new AbortController().signal,
        );

        await expect(
            validateCandidateAdmissionJobResultForPlan(
                result,
                input.workload.migrationInputs,
                input.workload.admission,
                input.workload.policy,
                input.workload.attempt,
            ),
        ).resolves.toBeDefined();
        expect(calls).toEqual([input.database]);
        expect(result.verification.results.filter((suite) => suite.platformEvidence)).toHaveLength(
            POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.length,
        );
        const author = result.verification.results.find((suite) => suite.suiteId === "implementation")!;
        expect(author.outcome).toBe("passed");
        expect(author.platformEvidence).toBeUndefined();
    });

    test("reports a structured failed platform proof", async () => {
        const input = await postgresPlatformInputFixture();
        const result = await runPostgresPlatformVerification(
            input,
            adapter(undefined, true),
            new AbortController().signal,
        );
        const suite = result.verification.results.find(
            (entry) => entry.suiteId === "platform-package-materialization",
        )!;

        expect(suite.outcome).toBe("failed");
        expect(suite.platformEvidence?.checks[0]).toMatchObject({
            outcome: "failed",
            findings: [
                { code: "probe-failed", path: "definition" },
                { code: "probe-failed", path: "package" },
            ],
        });
        expect(suite.diagnostics).toEqual([
            { code: "probe-failed", message: "materialized-definition rejected definition", redacted: true },
        ]);
        await expect(
            validateCandidateAdmissionJobResultForPlan(
                result,
                input.workload.migrationInputs,
                input.workload.admission,
                input.workload.policy,
                input.workload.attempt,
            ),
        ).resolves.toBeDefined();
    });

    test("fails closed when author execution is absent or substitutes a content digest", async () => {
        const input = await postgresPlatformInputFixture();
        const complete = adapter();
        const { verifyAuthorSuites: _verifyAuthorSuites, ...withoutAuthor } = complete;
        await expect(
            runPostgresPlatformVerification(input, withoutAuthor, new AbortController().signal),
        ).rejects.toThrow("cannot execute required author suites");
        await expect(
            runPostgresPlatformVerification(
                input,
                {
                    ...complete,
                    async verifyAuthorSuites({ suites }) {
                        return suites.map((suite) => ({
                            suiteId: suite.suiteId,
                            suiteDigest: DIGEST_A,
                            outcome: "passed" as const,
                            durationMs: 1,
                            evidenceDigest: suite.contentDigest,
                        }));
                    },
                },
                new AbortController().signal,
            ),
        ).rejects.toThrow("author verification evidence does not match");
    });

    test("propagates provisioning failures instead of fabricating a verification result", async () => {
        const input = await postgresPlatformInputFixture();
        const failing: PostgresPlatformVerificationAdapter = {
            async environmentVersions() {
                return [];
            },
            async verifyPackage() {
                throw new Error("no external disposable database was provisioned");
            },
        };

        await expect(runPostgresPlatformVerification(input, failing, new AbortController().signal)).rejects.toThrow(
            "no external disposable database was provisioned",
        );
    });
});

function adapter(
    onVerify?: (database: VerificationSandboxInput["database"]) => void,
    failMaterialization = false,
): PostgresPlatformVerificationAdapter {
    return {
        async environmentVersions() {
            return [{ name: "postgres", version: "16.4" }];
        },
        async verifyPackage({ database, platformSuites }) {
            onVerify?.(database);
            return {
                durationMs: 10,
                suites: platformSuites.map((suite) => {
                    const definition = POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.find(
                        (entry) => entry.suiteId === suite.suiteId,
                    )!;
                    const failed = failMaterialization && suite.suiteId === "platform-package-materialization";
                    const outcome = failed ? "failed" : suite.applicable ? "passed" : "not-applicable";
                    return {
                        schema: PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
                        suiteId: suite.suiteId,
                        suiteDigest: suite.suiteDigest,
                        applicability: definition.applicability,
                        outcome,
                        checks: definition.checks.map((checkId) => ({
                            checkId,
                            outcome,
                            subjectCount: suite.applicable ? 1 : 0,
                            observationDigest: DIGEST_A,
                            findings: failed
                                ? [
                                      { code: "probe-failed", path: "definition" },
                                      { code: "probe-failed", path: "package" },
                                  ]
                                : [],
                            findingsTruncated: false,
                        })),
                    };
                }),
            };
        },
        async verifyAuthorSuites({ suites }) {
            return suites.map((suite) => ({
                suiteId: suite.suiteId,
                suiteDigest: suite.contentDigest,
                outcome: "passed" as const,
                durationMs: 1,
                evidenceDigest: suite.contentDigest,
            }));
        },
    };
}

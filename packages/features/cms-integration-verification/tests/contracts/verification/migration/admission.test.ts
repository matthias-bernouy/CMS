import { describe, expect, test } from "bun:test";
import {
    identifyCandidateAdmissionJobResult,
    validateCandidateAdmissionJobResult,
    validateCandidateAdmissionJobResultForPlan,
} from "../../../../src/core/verification/migration/admission";
import { identifyMigrationVerificationInput } from "../../../../src/core/verification/migration/input";
import { DIGEST_A, DIGEST_B } from "../../fixtures";
import { ATTEMPT, migrationControlFixture } from "./fixtures";
import { candidateJobResult, migrationJobResult } from "./resultFixtures";

describe("candidate admission job result", () => {
    test("joins verification and all planned migrations to one exact admission attempt", async () => {
        const fixture = await migrationControlFixture();
        const result = candidateJobResult(fixture);
        const identified = await validateCandidateAdmissionJobResultForPlan(
            result,
            [fixture.input],
            fixture.admission,
            fixture.policy,
            ATTEMPT,
        );

        expect(identified.result.migrations).toHaveLength(1);
        expect(identified.result.migrations[0]?.migrationInputDigest).toBe(fixture.inputDigest);
        expect(identified.digest).toBe((await identifyCandidateAdmissionJobResult(result)).digest);
    });

    test("requires one shared fenced attempt and a closed wrapper shape", async () => {
        const fixture = await migrationControlFixture();
        const result = candidateJobResult(fixture);
        await expect(
            validateCandidateAdmissionJobResult({
                ...result,
                migrations: [{ ...result.migrations[0]!, attemptId: "attempt-other" }],
            }),
        ).rejects.toThrow(/share the verification fenced attempt/);
        await expect(validateCandidateAdmissionJobResult({ ...result, admissible: true })).rejects.toThrow(
            /admissible.*not an allowed field/,
        );
    });

    test("requires canonical unique migration input digests", async () => {
        const fixture = await migrationControlFixture();
        const migration = migrationJobResult(fixture);
        await expect(
            validateCandidateAdmissionJobResult({
                schema: "cms.integration.candidate-admission-job-result.v1",
                verification: fixture.verification,
                migrations: [
                    { ...migration, migrationInputDigest: DIGEST_B },
                    { ...migration, migrationInputDigest: DIGEST_A },
                ],
            }),
        ).rejects.toThrow(/canonical lexical order/);
        await expect(
            validateCandidateAdmissionJobResult({
                schema: "cms.integration.candidate-admission-job-result.v1",
                verification: fixture.verification,
                migrations: [migration, migration],
            }),
        ).rejects.toThrow(/duplicate/);
    });

    test("rejects missing, extra, or substituted planned migration results", async () => {
        const fixture = await migrationControlFixture();
        const result = candidateJobResult(fixture);
        await expect(
            validateCandidateAdmissionJobResultForPlan(
                { ...result, migrations: [] },
                [fixture.input],
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exact planned migration inputs/);
        await expect(
            validateCandidateAdmissionJobResultForPlan(
                {
                    ...result,
                    migrations: [{ ...result.migrations[0]!, migrationInputDigest: DIGEST_A }],
                },
                [fixture.input],
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exact planned migration inputs/);
    });

    test("binds both dependency matrices to the immutable admission snapshot", async () => {
        const fixture = await migrationControlFixture();
        const changed = await identifyMigrationVerificationInput({
            ...fixture.input,
            dependencyMatrices: [
                {
                    ...fixture.input.dependencyMatrices[0],
                    dependencies: fixture.input.dependencyMatrices[0].dependencies.map((entry, index) =>
                        index === 0 ? { ...entry, packageDigest: DIGEST_A } : entry,
                    ),
                },
                fixture.input.dependencyMatrices[1],
            ],
        });
        const result = candidateJobResult(fixture);
        await expect(
            validateCandidateAdmissionJobResultForPlan(
                {
                    ...result,
                    migrations: [{ ...result.migrations[0]!, migrationInputDigest: changed.digest }],
                },
                [changed.input],
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/substitutes the minimum dependency graph/);
    });
});

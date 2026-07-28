import { describe, expect, test } from "bun:test";
import {
    identifyMigrationJobResult,
    parseMigrationJobResult,
    validateMigrationJobResult,
    validateMigrationJobResultForInput,
} from "../../../../src/core/verification/migration/result";
import type { MigrationJobResultV1 } from "../../../../src/interfaces/verification/migration";
import { DIGEST_A, DIGEST_B } from "../../fixtures";
import { ATTEMPT, migrationControlFixture } from "./fixtures";
import { migrationJobResult, unsupportedEvidence } from "./resultFixtures";

describe("migration job result", () => {
    test("contains raw observations bound to one exact fenced input", async () => {
        const fixture = await migrationControlFixture();
        const result = migrationJobResult(fixture);
        const identified = await validateMigrationJobResultForInput(result, fixture.input, ATTEMPT);
        const parsed = await parseMigrationJobResult(identified.canonicalBytes);

        expect(parsed).toEqual(identified.result);
        expect(identified.result.observations.ledger.rows[0]?.attemptId).toBe("source-install-attempt");
        expect("outcome" in identified.result).toBeFalse();
        expect("admissible" in identified.result).toBeFalse();
    });

    test("rejects report verdicts and every attempted identity substitution", async () => {
        const fixture = await migrationControlFixture();
        const result = migrationJobResult(fixture);
        await expect(validateMigrationJobResult({ ...result, outcome: "passed" })).rejects.toThrow(
            /outcome.*not an allowed field/,
        );
        for (const attempt of [
            { ...result, jobId: "job-other" },
            { ...result, attemptId: "attempt-other" },
            { ...result, fencingToken: result.fencingToken + 1 },
            { ...result, migrationInputDigest: DIGEST_A },
            { ...result, runnerDigest: DIGEST_A },
            { ...result, environmentDigest: DIGEST_A },
        ]) {
            await expect(validateMigrationJobResultForInput(attempt, fixture.input, ATTEMPT)).rejects.toThrow();
        }
    });

    test("preserves historical ledger attempts but binds newly applied rows to the current attempt", async () => {
        const fixture = await migrationControlFixture();
        const result = migrationJobResult(fixture);
        await expect(validateMigrationJobResultForInput(result, fixture.input, ATTEMPT)).resolves.toBeDefined();
        const rows = result.observations.ledger.rows;
        await expect(
            validateMigrationJobResultForInput(
                withLedgerRows(result, [rows[0]!, { ...rows[1]!, attemptId: "stale-attempt" }]),
                fixture.input,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exact planned ledger/);
        await expect(
            validateMigrationJobResultForInput(
                withLedgerRows(result, [
                    rows[0]!,
                    { ...rows[1]!, sourcePackageDigest: DIGEST_A, targetPackageDigest: DIGEST_B },
                ]),
                fixture.input,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exact planned ledger/);
    });

    test("rejects contradictory equivalence, replay, ledger, and cutover observations", async () => {
        const fixture = await migrationControlFixture();
        const result = migrationJobResult(fixture);
        const contradictions: MigrationJobResultV1[] = [
            {
                ...result,
                observations: {
                    ...result.observations,
                    equivalence: { ...result.observations.equivalence, equivalent: false },
                },
            },
            {
                ...result,
                observations: {
                    ...result.observations,
                    replay: { ...result.observations.replay, ledgerRowsAfterReplay: 3 },
                },
            },
            withLedgerRows(result, result.observations.ledger.rows.toReversed()),
            {
                ...result,
                observations: {
                    ...result.observations,
                    cutover: {
                        ...result.observations.cutover,
                        providerDirect: {
                            ...result.observations.cutover.providerDirect,
                            callbackIds: ["substituted-callback"],
                        },
                    },
                },
            },
        ];
        for (const contradiction of contradictions) {
            await expect(validateMigrationJobResultForInput(contradiction, fixture.input, ATTEMPT)).rejects.toThrow();
        }
    });

    test("records unsupported checks explicitly without inventing runtime payload", async () => {
        const fixture = await migrationControlFixture();
        const result = migrationJobResult(fixture);
        const unsupported = {
            ...result,
            observations: {
                ...result.observations,
                failureInjections: [
                    { ...unsupportedEvidence(), boundary: "after-contract", injected: false, recovery: "not-observed" },
                ],
            },
        };
        await expect(identifyMigrationJobResult(unsupported)).resolves.toBeDefined();
        await expect(
            identifyMigrationJobResult({
                ...unsupported,
                observations: {
                    ...unsupported.observations,
                    failureInjections: [
                        {
                            ...unsupported.observations.failureInjections[0],
                            recoveredStateDigest: DIGEST_A,
                        },
                    ],
                },
            }),
        ).rejects.toThrow(/must not claim failure-injection payload/);
    });
});

function withLedgerRows(
    result: MigrationJobResultV1,
    rows: MigrationJobResultV1["observations"]["ledger"]["rows"],
): MigrationJobResultV1 {
    return {
        ...result,
        observations: { ...result.observations, ledger: { ...result.observations.ledger, rows } },
    };
}

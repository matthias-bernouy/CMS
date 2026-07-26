import { describe, expect, test } from "bun:test";
import { validateMigrationJobResultForInput } from "../../../../src/core/verification/migration/result";
import type { MigrationJobResultV1 } from "../../../../src/interfaces/verification/migration";
import { DIGEST_B } from "../../fixtures";
import { ATTEMPT, migrationControlFixture } from "./fixtures";
import { migrationJobResult, unsupportedEvidence } from "./resultFixtures";

describe("migration job result dependencies", () => {
    test("rejects observations that fabricate passed dependencies", async () => {
        const fixture = await migrationControlFixture();
        const result = migrationJobResult(fixture);
        const withoutFreshTarget: MigrationJobResultV1 = {
            ...result,
            observations: {
                ...result.observations,
                freshTarget: { ...unsupportedEvidence(), functionDigests: [] },
            },
        };
        await expect(validateMigrationJobResultForInput(withoutFreshTarget, fixture.input, ATTEMPT)).rejects.toThrow(
            /exact passed fresh and migrated target observations/,
        );
        await expect(
            validateMigrationJobResultForInput(
                {
                    ...result,
                    observations: {
                        ...result.observations,
                        replay: { ...result.observations.replay, ledgerRowsBefore: 0 },
                    },
                },
                fixture.input,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exact passed migrated target and complete ledger/);
        await expect(
            validateMigrationJobResultForInput(
                {
                    ...result,
                    observations: {
                        ...result.observations,
                        resumptions: [{ ...result.observations.resumptions[0]!, boundary: "after-contract" }],
                    },
                },
                fixture.input,
                ATTEMPT,
            ),
        ).rejects.toThrow(/must reference an observed injected failure/);
        await expect(
            validateMigrationJobResultForInput(
                {
                    ...result,
                    observations: {
                        ...result.observations,
                        cutover: {
                            ...result.observations.cutover,
                            activation: {
                                ...result.observations.cutover.activation,
                                activeBindingDigest: DIGEST_B,
                            },
                        },
                    },
                },
                fixture.input,
                ATTEMPT,
            ),
        ).rejects.toThrow(/exact observed CMS binding revision/);
    });
});

import { describe, expect, test } from "bun:test";
import {
    identifyMigrationVerificationInput,
    parseMigrationVerificationInput,
    validateMigrationVerificationInput,
} from "../../../../src/core/verification/migration/input";
import { identifyMigrationVerificationPlan } from "../../../../src/core/verification/migration/plan";
import { DIGEST_A } from "../../fixtures";
import { migrationControlFixture } from "./fixtures";

describe("migration verification input", () => {
    test("round-trips one exact immutable source-to-target proof plan", async () => {
        const fixture = await migrationControlFixture();
        const identified = await identifyMigrationVerificationInput(fixture.input);
        const parsed = await parseMigrationVerificationInput(identified.canonicalBytes);

        expect(identified.digest).toBe(fixture.inputDigest);
        expect(parsed).toEqual(identified.input);
        expect(parsed.dependencyMatrices.map((entry) => entry.selection)).toEqual(["minimum", "stable"]);
        expect(parsed.dependencyMatrices[0].dependencies.map((entry) => entry.kind)).toEqual([
            "dependency-b",
            "dependency-a",
        ]);
    });

    test("preserves topological dependency order in the input identity", async () => {
        const fixture = await migrationControlFixture();
        const reordered = {
            ...fixture.input,
            dependencyMatrices: [
                {
                    ...fixture.input.dependencyMatrices[0],
                    dependencies: fixture.input.dependencyMatrices[0].dependencies.toReversed(),
                },
                fixture.input.dependencyMatrices[1],
            ],
        };
        const identified = await identifyMigrationVerificationInput(reordered);

        expect(identified.digest).not.toBe(fixture.inputDigest);
        expect(identified.input.dependencyMatrices[0].dependencies[0]?.kind).toBe("dependency-a");
    });

    test("requires exactly minimum then stable and rejects duplicate dependency kinds", async () => {
        const fixture = await migrationControlFixture();
        await expect(
            validateMigrationVerificationInput({
                ...fixture.input,
                dependencyMatrices: fixture.input.dependencyMatrices.toReversed(),
            }),
        ).rejects.toThrow(/minimum then stable/);
        await expect(
            validateMigrationVerificationInput({
                ...fixture.input,
                dependencyMatrices: [
                    {
                        selection: "minimum",
                        dependencies: [
                            fixture.input.dependencyMatrices[0].dependencies[0],
                            fixture.input.dependencyMatrices[0].dependencies[0],
                        ],
                    },
                    fixture.input.dependencyMatrices[1],
                ],
            }),
        ).rejects.toThrow(/duplicate/);
    });

    test("fails closed on substituted selection, plan, runner, policy, or environment", async () => {
        const fixture = await migrationControlFixture();
        const attempts = [
            {
                ...fixture.input,
                statefulChanges: { ...fixture.input.statefulChanges, digest: DIGEST_A },
            },
            { ...fixture.input, migrationPlan: { ...fixture.input.migrationPlan, digest: DIGEST_A } },
            { ...fixture.input, runner: { ...fixture.input.runner, digest: DIGEST_A } },
            { ...fixture.input, policy: { ...fixture.input.policy, digest: DIGEST_A } },
            { ...fixture.input, environment: { ...fixture.input.environment, digest: DIGEST_A } },
        ];
        for (const attempt of attempts) {
            await expect(validateMigrationVerificationInput(attempt)).rejects.toThrow();
        }
    });

    test("rejects unsafe or noncanonical migration plans and unknown fields", async () => {
        const fixture = await migrationControlFixture();
        const migrations = fixture.input.migrationPlan.plan.migrations;
        await expect(
            validateMigrationVerificationInput({
                ...fixture.input,
                migrationPlan: {
                    ...fixture.input.migrationPlan,
                    plan: { ...fixture.input.migrationPlan.plan, migrations: migrations.toReversed() },
                },
            }),
        ).rejects.toThrow(/canonical lexical order/);
        await expect(
            validateMigrationVerificationInput({
                ...fixture.input,
                migrationPlan: {
                    ...fixture.input.migrationPlan,
                    plan: {
                        ...fixture.input.migrationPlan.plan,
                        migrations: [{ ...migrations[0], path: "../escape.sql" }, migrations[1]],
                    },
                },
            }),
        ).rejects.toThrow();
        await expect(validateMigrationVerificationInput({ ...fixture.input, trusted: true })).rejects.toThrow(
            /trusted.*not an allowed field/,
        );
    });

    test("binds legacy adoption to the exact canonical source ledger prefix", async () => {
        const fixture = await migrationControlFixture();
        const reference = fixture.input.migrationPlan.plan.install.coveredMigrations[0]!;
        const plan = {
            ...fixture.input.migrationPlan.plan,
            supportedSources: [
                {
                    ...fixture.input.migrationPlan.plan.supportedSources[0]!,
                    legacyAdoption: {
                        definitionVersion: fixture.input.source.version,
                        packageDigest: fixture.input.source.packageDigest,
                        observedSchema: {
                            schema: "cms.integration.observed-schema.v1" as const,
                            owner: { connectorKey: "primary", lineageId: "example-supabase-v1" },
                            namespaces: [],
                        },
                        coveredMigrations: [reference],
                    },
                },
            ],
        };
        const identified = await identifyMigrationVerificationPlan(
            plan,
            fixture.input.target.version,
            fixture.input.targetMigrationRevision,
        );
        await expect(
            validateMigrationVerificationInput({
                ...fixture.input,
                migrationPlan: { digest: identified.digest, plan: identified.plan },
            }),
        ).resolves.toBeDefined();

        const mismatch = await identifyMigrationVerificationPlan(
            {
                ...plan,
                supportedSources: [
                    {
                        ...plan.supportedSources[0]!,
                        legacyAdoption: { ...plan.supportedSources[0]!.legacyAdoption, coveredMigrations: [] },
                    },
                ],
            },
            fixture.input.target.version,
            fixture.input.targetMigrationRevision,
        );
        await expect(
            validateMigrationVerificationInput({
                ...fixture.input,
                migrationPlan: { digest: mismatch.digest, plan: mismatch.plan },
            }),
        ).rejects.toThrow(/exactly match the source ledger prefix/);
    });
});

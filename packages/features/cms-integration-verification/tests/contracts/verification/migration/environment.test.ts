import { describe, expect, test } from "bun:test";
import {
    identifyMigrationVerificationEnvironment,
    parseMigrationVerificationEnvironment,
    validateMigrationVerificationEnvironment,
} from "../../../../src/core/verification/migration/environment";
import { DIGEST_A } from "../../fixtures";
import { migrationControlFixture } from "./fixtures";

describe("migration verification environment", () => {
    test("canonically identifies every pinned execution input", async () => {
        const fixture = await migrationControlFixture();
        const first = await identifyMigrationVerificationEnvironment(fixture.environment);
        const parsed = await parseMigrationVerificationEnvironment(first.canonicalBytes);

        expect(parsed).toEqual(first.environment);
        expect(first.digest).toBe(fixture.input.environment.digest);
        expect(first.environment.postgres.imageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(first.environment.runner.digest).toBe(fixture.input.runner.digest);
    });

    test("requires canonical unique inventories rather than silently reordering them", async () => {
        const fixture = await migrationControlFixture();
        await expect(
            validateMigrationVerificationEnvironment({
                ...fixture.environment,
                roles: fixture.environment.roles.toReversed(),
            }),
        ).rejects.toThrow(/canonical lexical order/);
        await expect(
            validateMigrationVerificationEnvironment({
                ...fixture.environment,
                fixtures: [fixture.environment.fixtures[0], fixture.environment.fixtures[0]],
            }),
        ).rejects.toThrow(/duplicate/);
    });

    test("rejects runner substitution, mutable images, and open-ended fields", async () => {
        const fixture = await migrationControlFixture();
        await expect(
            validateMigrationVerificationEnvironment({
                ...fixture.environment,
                runner: { ...fixture.environment.runner, digest: DIGEST_A },
            }),
        ).rejects.toThrow(/does not identify the pinned runner/);
        await expect(
            validateMigrationVerificationEnvironment({
                ...fixture.environment,
                postgres: { ...fixture.environment.postgres, imageDigest: "postgres:17" },
            }),
        ).rejects.toThrow(/pinned sha256 image digest/);
        await expect(
            validateMigrationVerificationEnvironment({ ...fixture.environment, networkAccess: true }),
        ).rejects.toThrow(/networkAccess.*not an allowed field/);
    });
});

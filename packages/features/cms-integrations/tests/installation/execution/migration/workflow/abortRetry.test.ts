import { describe, expect, test } from "bun:test";
import { abortIntegrationMigration } from "@bernouy/cms-integrations";
import { MIGRATION_DIGEST, MIGRATION_PHASES, migrationFixture, runMigrationFixture } from "../fakeRuntimeFixture";

describe("migration retry after abort", () => {
    test("starts a fresh operation after aborting before activation", async () => {
        await assertFreshRetryAfterAbort("smoke-cms");
    });

    test("starts a fresh operation after aborting after activation", async () => {
        await assertFreshRetryAfterAbort("drain");
    });

    test("refuses abort after point-of-no-return intent is durable even when the remote receipt is lost", async () => {
        const fixture = await migrationFixture();
        fixture.runtime.failAfterRemote = "point-of-no-return";
        await expect(runMigrationFixture(fixture)).rejects.toThrow("injected point-of-no-return");

        const interrupted = await fixture.installations.get("commerce");
        expect(interrupted?.migrationOperation?.pointOfNoReturnReachedAt).toBeInstanceOf(Date);
        expect(
            interrupted?.migrationOperation?.journal.find((entry) => entry.phase === "point-of-no-return")?.status,
        ).toBe("failed");
        await expect(
            abortIntegrationMigration({
                installations: fixture.installations,
                integrationId: "commerce",
                actor: "repository-admin",
                reason: "remote receipt was lost",
                targetPackageRoot: "/tmp/cms-migration-target",
                runtime: fixture.runtime,
                clock: fixture.clock,
            }),
        ).rejects.toThrow(/after its point of no return/);
        expect(fixture.runtime.compensations.size).toBe(0);
    });
});

async function assertFreshRetryAfterAbort(failedPhase: "smoke-cms" | "drain"): Promise<void> {
    const fixture = await migrationFixture();
    fixture.runtime.failAfterRemote = failedPhase;
    await expect(runMigrationFixture(fixture)).rejects.toThrow(`injected ${failedPhase}`);
    const interrupted = await fixture.installations.get("commerce");
    const interruptedId = interrupted?.migrationOperation?.id;
    expect(interrupted?.migrationOperation?.status).toBe("paused");

    const aborted = await abortIntegrationMigration({
        installations: fixture.installations,
        integrationId: "commerce",
        actor: "repository-admin",
        reason: `abort after ${failedPhase}`,
        targetPackageRoot: "/tmp/cms-migration-target",
        runtime: fixture.runtime,
        clock: fixture.clock,
    });
    expect(aborted).toMatchObject({
        definitionVersion: "1.0.0",
        packageDigest: "e".repeat(64),
        status: "success",
    });
    expect(aborted.migrationOperation).toMatchObject({ id: interruptedId, status: "aborted" });
    const countsBeforeRetry = new Map(fixture.runtime.executions);

    fixture.runtime.failAfterRemote = undefined;
    const retried = await runMigrationFixture(fixture);

    expect(retried.installation).toMatchObject({
        definitionVersion: "1.1.0",
        packageDigest: MIGRATION_DIGEST,
        status: "success",
    });
    expect(retried.installation.migrationOperation).toMatchObject({ status: "completed" });
    expect(retried.installation.migrationOperation?.id).not.toBe(interruptedId);
    expect(retried.installation.migrationOperation?.abortRequestedAt).toBeUndefined();
    for (const phase of MIGRATION_PHASES) {
        expect(fixture.runtime.executions.get(phase)).toBe((countsBeforeRetry.get(phase) ?? 0) + 1);
    }
}

import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import {
    RESTART_MIGRATION_DIGEST,
    RESTART_MIGRATION_PHASES,
    RestartMigrationClock,
    createRestartMigrationRoot,
    runRestartMigration,
    seedRestartMigration,
} from "./restartFixture";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("reloads a fenced migration from BSON and resumes safely after the lease expires", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cms-migration-restart-"));
    temporaryRoots.push(directory);
    const installationStore = join(directory, "installations.bson");
    const remoteStore = join(directory, "remote.bson");
    const startedAt = new Date("2026-07-27T10:00:00.000Z");
    const firstClock = new RestartMigrationClock(startedAt);
    const firstRoot = await createRestartMigrationRoot({
        installationStore,
        remoteStore,
        clock: firstClock,
        crashAfterSucceededPhase: "expand",
    });
    await seedRestartMigration(firstRoot);

    await expect(runRestartMigration(firstRoot)).rejects.toThrow("simulated composition crash after durable expand");

    const secondClock = new RestartMigrationClock(startedAt);
    const secondRoot = await createRestartMigrationRoot({ installationStore, remoteStore, clock: secondClock });
    expect(secondRoot.installations).not.toBe(firstRoot.installations);
    expect(secondRoot.runtime).not.toBe(firstRoot.runtime);
    const reloaded = await secondRoot.installations.get("commerce");
    const interrupted = requiredOperation(reloaded);
    const interruptedJournalIdentity = interrupted.journal.map(({ id, idempotencyKey, phase, targetDigest }) => ({
        id,
        idempotencyKey,
        phase,
        targetDigest,
    }));
    const expand = interrupted.journal.find(({ phase }) => phase === "expand");

    expect(interrupted).toMatchObject({
        status: "running",
        fencingToken: 1,
        targetVersion: "1.1.0",
        targetPackageDigest: RESTART_MIGRATION_DIGEST,
    });
    expect(interrupted.attemptId).toBeString();
    expect(interrupted.startedAt).toEqual(startedAt);
    expect(interrupted.leaseExpiresAt).toEqual(new Date(startedAt.getTime() + 1_000));
    expect(interrupted.leaseExpiresAt).toBeInstanceOf(Date);
    expect(expand).toMatchObject({
        status: "succeeded",
        attemptId: interrupted.attemptId,
        externalOperationId: expect.stringContaining("external:"),
        confirmationDigest: expect.any(String),
    });
    expect(expand?.startedAt).toBeInstanceOf(Date);
    expect(expand?.confirmedAt).toBeInstanceOf(Date);
    expect(interrupted.journal.filter(({ status }) => status === "pending")).toHaveLength(9);

    await expect(runRestartMigration(secondRoot)).rejects.toThrow(/leased by another attempt/);
    expect((await secondRoot.installations.get("commerce"))?.migrationOperation).toEqual(interrupted);

    secondClock.advance(1_001);
    const completed = await runRestartMigration(secondRoot);
    const operation = requiredOperation(completed.installation);
    expect(completed.installation).toMatchObject({
        definitionVersion: "1.1.0",
        packageDigest: RESTART_MIGRATION_DIGEST,
        status: "success",
    });
    expect(operation.status).toBe("completed");
    expect(operation.fencingToken).toBe(2);
    expect(operation.attemptId).not.toBe(interrupted.attemptId);
    expect(operation.startedAt).toEqual(startedAt);
    expect(operation.leaseExpiresAt).toBeInstanceOf(Date);
    expect(operation.journal.every(({ status }) => status === "succeeded")).toBeTrue();
    expect(
        operation.journal.map(({ id, idempotencyKey, phase, targetDigest }) => ({
            id,
            idempotencyKey,
            phase,
            targetDigest,
        })),
    ).toEqual(interruptedJournalIdentity);
    expect(operation.journal.find(({ phase }) => phase === "expand")?.attemptId).toBe(interrupted.attemptId);
    expect(operation.journal.find(({ phase }) => phase === "deploy-functions")?.attemptId).toBe(operation.attemptId);
    const executions = await secondRoot.runtime.executionCounts();
    expect(RESTART_MIGRATION_PHASES.map((phase) => [phase, executions.get(phase)])).toEqual(
        RESTART_MIGRATION_PHASES.map((phase) => [phase, 1]),
    );

    const staleWriter = await createRestartMigrationRoot({ installationStore, remoteStore, clock: secondClock });
    await expect(runRestartMigration(staleWriter, reloaded!)).rejects.toThrow(/migration state changed concurrently/);
    const finalRoot = await createRestartMigrationRoot({ installationStore, remoteStore, clock: secondClock });
    const persisted = await finalRoot.installations.get("commerce");
    expect(persisted).toEqual(completed.installation);
    expect(requiredOperation(persisted).fencingToken).toBe(2);
});

function requiredOperation(installation: IntegrationInstallation | null) {
    const operation = installation?.migrationOperation;
    if (!operation) {
        throw new Error("restart migration operation is missing");
    }
    return operation;
}

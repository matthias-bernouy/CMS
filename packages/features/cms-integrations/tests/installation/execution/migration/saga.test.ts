import { describe, expect, test } from "bun:test";
import {
    MIGRATION_DIGEST,
    MIGRATION_PHASES,
    migrationFixture,
    runMigrationFixture,
    runPublicMigrationFixture,
} from "./fakeRuntimeFixture";

describe("durable integration migration saga", () => {
    for (const failedPhase of MIGRATION_PHASES) {
        test(`resumes safely after remote success at ${failedPhase}`, async () => {
            const fixture = await migrationFixture();
            fixture.runtime.failAfterRemote = failedPhase;

            await expect(runMigrationFixture(fixture)).rejects.toThrow(`injected ${failedPhase}`);
            const interrupted = await fixture.installations.get("commerce");
            expect(interrupted?.migrationOperation?.status).toBe("paused");
            if (MIGRATION_PHASES.indexOf(failedPhase) >= MIGRATION_PHASES.indexOf("drain")) {
                expect(interrupted?.migrationOperation?.activatedAt).toBeInstanceOf(Date);
            } else {
                expect(interrupted?.definitionVersion).toBe("1.0.0");
            }
            if (failedPhase === "contract") {
                expect(interrupted?.migrationOperation?.pointOfNoReturnReachedAt).toBeInstanceOf(Date);
            }

            fixture.runtime.failAfterRemote = undefined;
            const resumed = await runMigrationFixture(fixture);

            expect(resumed.installation.definitionVersion).toBe("1.1.0");
            expect(resumed.installation.packageDigest).toBe(MIGRATION_DIGEST);
            expect(resumed.installation.migrationOperation?.status).toBe("completed");
            expect(resumed.installation.migrationOperation?.pointOfNoReturnReachedAt).toBeInstanceOf(Date);
            expect(resumed.installation.connectorBindings?.primary).toMatchObject({
                lineageId: "commerce-supabase-v1",
                migrationRevision: 3,
                outputs: { functionsBaseUrl: "https://target.example/functions/v1" },
            });
            expect(fixture.runtime.executions.get(failedPhase)).toBe(1);
            expect(fixture.runtime.remote.size).toBe(MIGRATION_PHASES.length);
            expect(fixture.runtime.connectorInstanceIds.size).toBe(1);
        });
    }

    test("fences an attempt whose lease expires during an external mutation", async () => {
        const fixture = await migrationFixture();
        fixture.runtime.afterExecute = () => fixture.clock.advance(2_000);

        await expect(runMigrationFixture(fixture, 1_000)).rejects.toThrow(/lease expired/);
        fixture.runtime.afterExecute = undefined;
        const resumed = await runMigrationFixture(fixture, 1_000);

        expect(resumed.installation.migrationOperation?.fencingToken).toBe(2);
        expect(fixture.runtime.executions.get("expand")).toBe(1);
    });

    test("keeps activation and point of no return as separate durable boundaries", async () => {
        const fixture = await migrationFixture();
        fixture.runtime.failAfterRemote = "drain";

        await expect(runMigrationFixture(fixture)).rejects.toThrow();
        const installation = await fixture.installations.get("commerce");

        expect(installation?.definitionVersion).toBe("1.1.0");
        expect(installation?.migrationOperation?.activatedAt).toBeInstanceOf(Date);
        expect(installation?.migrationOperation?.pointOfNoReturnReachedAt).toBeUndefined();
    });

    test("serializes concurrent upgrades with an installation lease", async () => {
        const fixture = await migrationFixture();
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        fixture.runtime.afterExecute = async () => {
            entered();
            await gate;
        };

        const first = runMigrationFixture(fixture);
        await started;
        await expect(runMigrationFixture(fixture)).rejects.toThrow(/leased by another attempt/);
        release();
        expect((await first).installation.migrationOperation?.status).toBe("completed");
    });

    test("heartbeats a lease while a long external mutation is in flight", async () => {
        const fixture = await migrationFixture();
        fixture.clock.now = () => new Date();
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        fixture.runtime.afterExecute = async (context) => {
            if (context.phase === "expand") {
                entered();
                await gate;
            }
        };

        const first = runMigrationFixture(fixture, 1_000);
        await started;
        await Bun.sleep(1_200);
        const heartbeatLease = (await fixture.installations.get("commerce"))?.migrationOperation?.leaseExpiresAt;
        expect(heartbeatLease?.getTime()).toBeGreaterThan(Date.now());
        await expect(runMigrationFixture(fixture, 1_000)).rejects.toThrow(/leased by another attempt/);

        release();
        expect((await first).installation.migrationOperation?.status).toBe("completed");
    });

    test("heartbeats a lease while a long remote confirmation is in flight", async () => {
        const fixture = await migrationFixture();
        fixture.clock.now = () => new Date();
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        fixture.runtime.beforeConfirm = async (context) => {
            if (context.phase === "expand") {
                entered();
                await gate;
            }
        };

        const first = runMigrationFixture(fixture, 1_000);
        await started;
        await Bun.sleep(1_200);
        const heartbeatLease = (await fixture.installations.get("commerce"))?.migrationOperation?.leaseExpiresAt;
        expect(heartbeatLease?.getTime()).toBeGreaterThan(Date.now());
        await expect(runMigrationFixture(fixture, 1_000)).rejects.toThrow(/leased by another attempt/);

        release();
        expect((await first).installation.migrationOperation?.status).toBe("completed");
    });

    test("keeps the live lease after target activation", async () => {
        const fixture = await migrationFixture();
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        fixture.runtime.afterExecute = async (context) => {
            if (context.phase === "drain") {
                entered();
                await gate;
            }
        };

        const first = runMigrationFixture(fixture);
        await started;
        expect((await fixture.installations.get("commerce"))?.migrationOperation?.status).toBe("activated");
        await expect(runMigrationFixture(fixture)).rejects.toThrow(/leased by another attempt/);
        release();
        expect((await first).installation.migrationOperation?.status).toBe("completed");
    });

    test("resumes post-activation through the public upgrade command", async () => {
        const fixture = await migrationFixture();
        fixture.runtime.failAfterRemote = "drain";
        await expect(runPublicMigrationFixture(fixture)).rejects.toThrow("injected drain");
        expect((await fixture.installations.get("commerce"))?.definitionVersion).toBe("1.1.0");

        fixture.runtime.failAfterRemote = undefined;
        const resumed = await runPublicMigrationFixture(fixture);

        expect(resumed.installation.migrationOperation?.status).toBe("completed");
        expect(resumed.installation.definitionVersion).toBe("1.1.0");
    });
});

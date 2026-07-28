import { afterEach, describe, expect, test } from "bun:test";
import {
    abortIntegrationMigration,
    runDurableMigrationUpgrade,
    type IntegrationMigrationPhase,
} from "@bernouy/cms-integrations";
import { FailAfterCompensationRuntime, FailAfterRemoteRuntime, RealMigrationFixture } from "./realRuntimeFixture";

const fixtures: RealMigrationFixture[] = [];
const PHASES: IntegrationMigrationPhase[] = [
    "expand",
    "deploy-functions",
    "smoke-target",
    "provider-direct-transition",
    "switch-cms-binding",
    "smoke-cms",
    "drain",
    "point-of-no-return",
    "contract",
];

afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(async (fixture) => await fixture.dispose()));
});

describe("production integration migration runtime", () => {
    for (const phase of PHASES) {
        test(`recovers a crash after the real ${phase} phase`, async () => {
            const fixture = await initializedFixture();
            const faulted = new FailAfterRemoteRuntime(fixture.runtime, phase);

            await expect(run(fixture, faulted)).rejects.toThrow(`injected after ${phase}`);
            const interrupted = await fixture.installation();
            expect(interrupted.migrationOperation?.status).toBe("paused");

            const completed = await run(fixture, fixture.runtime);
            expect(completed.installation).toMatchObject({
                definitionVersion: "1.1.0",
                packageDigest: "d".repeat(64),
                status: "success",
            });
            expect(completed.installation.migrationOperation).toMatchObject({
                status: "completed",
                pointOfNoReturnReachedAt: expect.any(Date),
                connectors: [
                    {
                        connectorKey: "primary",
                        connectorInstanceId: "connector-instance-1",
                        plan: {
                            cmsMediated: { strategy: "binding-switch" },
                            providerDirect: { strategy: "expand-in-code", callbackIds: ["stripe"] },
                        },
                    },
                ],
            });
            expect(completed.installation.connectorBindings?.primary).toMatchObject({
                migrationRevision: 3,
                outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
            });
            expect((await fixture.sources.getSource("urn:commerce"))?.endpoints[0]?.targetUrl).toEndWith(
                "/cms-commerce-v2/health",
            );
        });
    }

    test("does not conflate activation with the point of no return", async () => {
        const fixture = await initializedFixture();
        const faulted = new FailAfterRemoteRuntime(fixture.runtime, "drain");

        await expect(run(fixture, faulted)).rejects.toThrow("injected after drain");
        const interrupted = await fixture.installation();

        expect(interrupted.definitionVersion).toBe("1.1.0");
        expect(interrupted.migrationOperation?.activatedAt).toBeInstanceOf(Date);
        expect(interrupted.migrationOperation?.pointOfNoReturnReachedAt).toBeUndefined();
    });

    test("probes the side-by-side target and then the stable CMS binding through real Source execution", async () => {
        const fixture = await initializedFixture();

        await run(fixture, fixture.runtime);

        expect(fixture.supabase.smokeRequests).toHaveLength(4);
        expect(fixture.supabase.smokeRequests).toEqual(
            fixture.supabase.smokeRequests.map(() => ({
                method: "GET",
                path: "/functions/v1/cms-commerce-v2/health",
                slug: "cms-commerce-v2",
            })),
        );
    });

    test("fails target smoke closed before changing the stable CMS binding and resumes safely", async () => {
        const fixture = await initializedFixture();
        fixture.supabase.smokeBody = { ok: false };

        await expect(run(fixture, fixture.runtime)).rejects.toThrow(
            'CMS migration smoke endpoint "urn:commerce:health" returned an unexpected body',
        );
        expect((await fixture.sources.getSource("urn:commerce"))?.endpoints[0]?.targetUrl).toEndWith(
            "/cms-commerce/health",
        );
        expect((await fixture.installation()).migrationOperation).toMatchObject({ status: "paused" });

        fixture.supabase.smokeBody = { ok: true };
        expect((await run(fixture, fixture.runtime)).installation.definitionVersion).toBe("1.1.0");
    });

    test("fails stable CMS smoke closed before activation and resumes the exact switched binding", async () => {
        const fixture = await initializedFixture();
        fixture.supabase.queueSmokeResponse(200, { ok: true });
        fixture.supabase.queueSmokeResponse(200, { ok: true });
        fixture.supabase.queueSmokeResponse(200, { ok: false });

        await expect(run(fixture, fixture.runtime)).rejects.toThrow(
            'CMS migration smoke endpoint "urn:commerce:health" returned an unexpected body',
        );
        expect((await fixture.sources.getSource("urn:commerce"))?.endpoints[0]?.targetUrl).toEndWith(
            "/cms-commerce-v2/health",
        );
        const paused = await fixture.installation();
        expect(paused.definitionVersion).toBe("1.0.0");
        expect(paused.migrationOperation?.status).toBe("paused");
        expect(paused.migrationOperation?.activatedAt).toBeUndefined();

        expect((await run(fixture, fixture.runtime)).installation.definitionVersion).toBe("1.1.0");
    });

    test("compensates the CMS binding and records audited abort provenance before activation", async () => {
        const fixture = await pausedAfterBindingFixture();

        const aborted = await abort(fixture, fixture.runtime);

        expect(aborted).toMatchObject({ definitionVersion: "1.0.0", status: "success" });
        expect(aborted.migrationOperation).toMatchObject({
            status: "aborted",
            abortRequestedBy: "repository-admin",
            abortReason: "target smoke failed after binding",
            abortedAt: expect.any(Date),
        });
        expect(
            aborted.migrationOperation?.journal.find((entry) => entry.phase === "switch-cms-binding")?.compensation,
        ).toMatchObject({ status: "succeeded", confirmedAt: expect.any(Date) });
        expect((await fixture.sources.getSource("urn:commerce"))?.endpoints[0]?.targetUrl).toEndWith(
            "/cms-commerce/health",
        );
    });

    test("retries compensation idempotently after a crash following the remote rollback", async () => {
        const fixture = await pausedAfterBindingFixture();
        const faulted = new FailAfterCompensationRuntime(fixture.runtime, "switch-cms-binding");

        await expect(abort(fixture, faulted)).rejects.toThrow("injected after switch-cms-binding compensation");
        expect((await fixture.sources.getSource("urn:commerce"))?.endpoints[0]?.targetUrl).toEndWith(
            "/cms-commerce/health",
        );
        expect(
            (await fixture.installation()).migrationOperation?.journal.find(
                (entry) => entry.phase === "switch-cms-binding",
            )?.compensation?.status,
        ).toBe("failed");
        await expect(run(fixture, fixture.runtime)).rejects.toThrow("abort compensation in progress");

        expect((await abort(fixture, fixture.runtime)).migrationOperation?.status).toBe("aborted");
    });

    test("rolls the active pin and binding back before the separate point of no return", async () => {
        const fixture = await initializedFixture();
        const faulted = new FailAfterRemoteRuntime(fixture.runtime, "drain");

        await expect(run(fixture, faulted)).rejects.toThrow("injected after drain");
        expect((await fixture.installation()).definitionVersion).toBe("1.1.0");

        const aborted = await abort(fixture, fixture.runtime);

        expect(aborted).toMatchObject({
            definitionVersion: "1.0.0",
            packageDigest: "e".repeat(64),
            connectorBindings: { primary: { migrationRevision: 1 } },
            status: "success",
        });
        expect(aborted.migrationOperation).toMatchObject({
            status: "aborted",
            activatedAt: expect.any(Date),
        });
        expect(aborted.migrationOperation?.pointOfNoReturnReachedAt).toBeUndefined();
        expect((await fixture.sources.getSource("urn:commerce"))?.endpoints[0]?.targetUrl).toEndWith(
            "/cms-commerce/health",
        );
    });

    test("refuses automatic rollback after the durable point of no return", async () => {
        const fixture = await initializedFixture();
        const faulted = new FailAfterRemoteRuntime(fixture.runtime, "contract");

        await expect(run(fixture, faulted)).rejects.toThrow("injected after contract");
        await expect(abort(fixture, fixture.runtime)).rejects.toThrow("after its point of no return");
        expect((await fixture.installation()).definitionVersion).toBe("1.1.0");
    });

    test("pauses during a declared drain and resumes only after the deadline", async () => {
        const fixture = await initializedFixture();
        fixture.setDrainSeconds(5);

        await expect(run(fixture, fixture.runtime)).rejects.toThrow(
            "migration drain period is active until 2026-07-26T10:00:05.000Z",
        );
        const draining = await fixture.installation();
        expect(draining.definitionVersion).toBe("1.1.0");
        expect(draining.migrationOperation?.activatedAt).toEqual(new Date("2026-07-26T10:00:00.000Z"));
        expect(draining.migrationOperation?.pointOfNoReturnReachedAt).toBeUndefined();

        fixture.clock.advance(5_000);
        const completed = await run(fixture, fixture.runtime);
        expect(completed.installation.migrationOperation).toMatchObject({
            status: "completed",
            pointOfNoReturnReachedAt: new Date("2026-07-26T10:00:05.000Z"),
        });
    });
});

async function initializedFixture(): Promise<RealMigrationFixture> {
    const fixture = await new RealMigrationFixture().initialize();
    fixtures.push(fixture);
    return fixture;
}

async function pausedAfterBindingFixture(): Promise<RealMigrationFixture> {
    const fixture = await initializedFixture();
    fixture.supabase.queueSmokeResponse(200, { ok: true });
    fixture.supabase.queueSmokeResponse(200, { ok: true });
    fixture.supabase.queueSmokeResponse(200, { ok: false });
    await expect(run(fixture, fixture.runtime)).rejects.toThrow("returned an unexpected body");
    return fixture;
}

async function abort(fixture: RealMigrationFixture, runtime: RealMigrationFixture["runtime"]) {
    return await abortIntegrationMigration({
        installations: fixture.installations,
        integrationId: "commerce",
        actor: "repository-admin",
        reason: "target smoke failed after binding",
        targetPackageRoot: fixture.root,
        runtime,
        clock: fixture.clock,
    });
}

async function run(fixture: RealMigrationFixture, runtime: RealMigrationFixture["runtime"]) {
    return await runDurableMigrationUpgrade({
        installations: fixture.installations,
        installation: await fixture.installation(),
        targetDefinition: fixture.target,
        resolvedPackage: {
            root: fixture.root,
            kind: "commerce",
            version: "1.1.0",
            digest: "d".repeat(64),
            definition: fixture.target,
        },
        runtime,
        clock: fixture.clock,
    });
}

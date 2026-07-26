import { afterEach, describe, expect, test } from "bun:test";
import { runDurableMigrationUpgrade, type IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import { FailAfterRemoteRuntime, RealMigrationFixture } from "./realRuntimeFixture";

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

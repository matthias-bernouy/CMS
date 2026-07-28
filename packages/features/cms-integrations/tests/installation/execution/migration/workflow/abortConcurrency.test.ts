import { afterEach, describe, expect, test } from "bun:test";
import {
    abortIntegrationMigration,
    runDurableMigrationUpgrade,
    type IntegrationMigrationRuntime,
    type IntegrationMigrationStepContext,
} from "@bernouy/cms-integrations";
import { RealMigrationFixture } from "../realRuntimeFixture";

const fixtures: RealMigrationFixture[] = [];

afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(async (fixture) => await fixture.dispose()));
});

describe("migration abort fencing", () => {
    test("does not let an expired compensation attempt pause its replacement", async () => {
        const fixture = await pausedAfterBindingFixture();
        const runtime = new BlockingCompensationRuntime(fixture.runtime);

        const first = abort(fixture, runtime);
        await runtime.firstStarted;
        fixture.clock.advance(1_001);
        const replacement = abort(fixture, runtime);
        await runtime.replacementStarted;
        const replacementOwner = (await fixture.installation()).migrationOperation;
        expect(replacementOwner).toMatchObject({ fencingToken: 3, status: "running" });

        runtime.releaseFirst();
        await expect(first).rejects.toThrow("injected stale compensation failure");
        expect((await fixture.installation()).migrationOperation).toMatchObject({
            attemptId: replacementOwner?.attemptId,
            fencingToken: 3,
            status: "running",
        });

        runtime.releaseReplacement();
        expect((await replacement).migrationOperation?.status).toBe("aborted");
    });
});

class BlockingCompensationRuntime implements IntegrationMigrationRuntime {
    private compensationCalls = 0;
    private readonly firstGate: Promise<void>;
    private readonly replacementGate: Promise<void>;
    private firstEntered!: () => void;
    private replacementEntered!: () => void;
    readonly firstStarted: Promise<void>;
    readonly replacementStarted: Promise<void>;
    releaseFirst!: () => void;
    releaseReplacement!: () => void;

    constructor(private readonly inner: IntegrationMigrationRuntime) {
        this.firstStarted = new Promise((resolve) => {
            this.firstEntered = resolve;
        });
        this.replacementStarted = new Promise((resolve) => {
            this.replacementEntered = resolve;
        });
        this.firstGate = new Promise((resolve) => {
            this.releaseFirst = resolve;
        });
        this.replacementGate = new Promise((resolve) => {
            this.releaseReplacement = resolve;
        });
    }

    executeStep(context: IntegrationMigrationStepContext) {
        return this.inner.executeStep(context);
    }

    confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        return this.inner.confirmStep(context, previous);
    }

    async compensateStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        if (!this.inner.compensateStep) {
            throw new Error("inner runtime cannot compensate");
        }
        const result = await this.inner.compensateStep(context, previous);
        this.compensationCalls += 1;
        if (this.compensationCalls === 1) {
            this.firstEntered();
            await this.firstGate;
            throw new Error("injected stale compensation failure");
        }
        if (this.compensationCalls === 2) {
            this.replacementEntered();
            await this.replacementGate;
        }
        return result;
    }
}

async function pausedAfterBindingFixture(): Promise<RealMigrationFixture> {
    const fixture = await new RealMigrationFixture().initialize();
    fixtures.push(fixture);
    fixture.supabase.queueSmokeResponse(200, { ok: true });
    fixture.supabase.queueSmokeResponse(200, { ok: true });
    fixture.supabase.queueSmokeResponse(200, { ok: false });
    await expect(run(fixture)).rejects.toThrow("returned an unexpected body");
    return fixture;
}

async function abort(fixture: RealMigrationFixture, runtime: IntegrationMigrationRuntime) {
    return await abortIntegrationMigration({
        installations: fixture.installations,
        integrationId: "commerce",
        actor: "repository-admin",
        reason: "target smoke failed after binding",
        targetPackageRoot: fixture.root,
        runtime,
        clock: fixture.clock,
        leaseMs: 1_000,
    });
}

async function run(fixture: RealMigrationFixture) {
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
        runtime: fixture.runtime,
        clock: fixture.clock,
    });
}

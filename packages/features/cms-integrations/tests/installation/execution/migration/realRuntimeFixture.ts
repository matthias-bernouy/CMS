import {
    CmsSourceBindingMigrationHandler,
    CmsSourceFunctionalMigrationProbe,
    InMemoryIntegrationInstallationRepository,
    ProductionIntegrationMigrationRuntime,
    type IntegrationDefinition,
    type IntegrationMigrationPhase,
    type IntegrationMigrationRuntime,
    type IntegrationMigrationStepContext,
} from "@bernouy/cms-integrations";
import {
    SupabaseConnectorDeployer,
    SupabaseConnectorMigrationAdapter,
    SupabaseFunctionMigrationHandler,
} from "@bernouy/cms-integrations/supabase";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, sourceDtoToSource, type SourceRepository } from "@bernouy/cms-sources";
import { rm } from "node:fs/promises";
import { FakeSupabaseManagementApi } from "./fakeSupabaseManagementApi";
import { createRealMigrationPackageFixture } from "./realRuntimePackageFixture";

export class RealMigrationFixture {
    readonly installations = new InMemoryIntegrationInstallationRepository();
    readonly storedSources = new InMemorySourceRepository();
    readonly sources: SourceRepository;
    readonly secrets = new InMemorySecretStore();
    readonly supabase = new FakeSupabaseManagementApi();
    readonly clock = new TestClock();
    root = "";
    target!: IntegrationDefinition;
    runtime!: IntegrationMigrationRuntime;

    constructor(decorateSources: (stored: InMemorySourceRepository) => SourceRepository = (stored) => stored) {
        this.sources = decorateSources(this.storedSources);
    }

    async initialize(): Promise<this> {
        const packageFixture = await createRealMigrationPackageFixture();
        this.root = packageFixture.root;
        this.target = packageFixture.target;
        const source = packageFixture.source;
        await this.sources.createSource(sourceDtoToSource(source.artifacts![0]!.source));
        await this.installations.create({
            id: "commerce",
            label: "Commerce",
            definitionVersion: "1.0.0",
            definitionSnapshot: source,
            packageDigest: "e".repeat(64),
            connectorBindings: {
                primary: {
                    connectorKey: "primary",
                    provider: "supabase",
                    lineageId: "commerce-v1",
                    connectorInstanceId: "connector-instance-1",
                    migrationRevision: 1,
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                },
            },
            connectorBaselineAdoptions: [
                {
                    id: "1".repeat(64),
                    actor: "fixture-admin",
                    adoptedAt: new Date("2026-07-26T09:00:00.000Z"),
                    sourceDefinitionVersion: "1.0.0",
                    sourcePackageDigest: "e".repeat(64),
                    targetDefinitionVersion: "1.1.0",
                    targetPackageDigest: "d".repeat(64),
                    connectorKey: "primary",
                    provider: "supabase",
                    lineageId: "commerce-v1",
                    connectorInstanceId: "connector-instance-1",
                    migrationRevision: 1,
                    baselineDigest: "2".repeat(64),
                    externalOperationId: "fixture-adoption",
                },
            ],
            status: "success",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: "urn:commerce", action: "created" }],
        });
        const config = { projectRef: "project", accessToken: "token", fetch: this.supabase.fetch };
        const connectorDeployer = new SupabaseConnectorDeployer(config);
        const functionDeployment = new SupabaseFunctionMigrationHandler(config);
        const cmsBindingDeps = {
            sources: this.sources,
            secrets: this.secrets,
            installations: this.installations,
            connectorDeployers: [connectorDeployer],
            sourceExecutorDeps: { fetchImpl: this.supabase.fetch },
        };
        const cmsBinding = new CmsSourceBindingMigrationHandler(cmsBindingDeps);
        this.runtime = new ProductionIntegrationMigrationRuntime({
            connectorAdapters: [new SupabaseConnectorMigrationAdapter(config)],
            functionDeployment,
            targetSmoke: new CmsSourceFunctionalMigrationProbe(cmsBindingDeps, "target"),
            cmsBinding,
            cmsSmoke: new CmsSourceFunctionalMigrationProbe(cmsBindingDeps, "stable"),
            clock: this.clock,
        });
        return this;
    }

    async dispose(): Promise<void> {
        if (this.root) {
            await rm(this.root, { force: true, recursive: true });
        }
    }

    async installation() {
        const installation = await this.installations.get("commerce");
        if (!installation) {
            throw new Error("missing integration fixture");
        }
        return installation;
    }

    setDrainSeconds(seconds: number): void {
        const plan = this.target.connectors?.[0]?.migration;
        if (!plan?.cmsMediated || !plan.providerDirect) {
            throw new Error("missing migration cutover fixture");
        }
        plan.cmsMediated.drainSeconds = seconds;
        plan.providerDirect.drainSeconds = seconds;
    }
}

export class FailAfterRemoteRuntime implements IntegrationMigrationRuntime {
    private failed = false;

    constructor(
        private readonly inner: IntegrationMigrationRuntime,
        private readonly phase: IntegrationMigrationPhase,
    ) {}

    async executeStep(context: IntegrationMigrationStepContext) {
        const result = await this.inner.executeStep(context);
        if (!this.failed && context.phase === this.phase) {
            this.failed = true;
            throw new Error(`injected after ${context.phase}`);
        }
        return result;
    }

    async confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        return await this.inner.confirmStep(context, previous);
    }
}

export class FailAfterCompensationRuntime implements IntegrationMigrationRuntime {
    private failed = false;

    constructor(
        private readonly inner: IntegrationMigrationRuntime,
        private readonly phase: IntegrationMigrationPhase,
    ) {}

    async executeStep(context: IntegrationMigrationStepContext) {
        return await this.inner.executeStep(context);
    }

    async confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        return await this.inner.confirmStep(context, previous);
    }

    async compensateStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        if (!this.inner.compensateStep) {
            throw new Error("inner runtime does not support compensation");
        }
        const result = await this.inner.compensateStep(context, previous);
        if (!this.failed && context.phase === this.phase) {
            this.failed = true;
            throw new Error(`injected after ${context.phase} compensation`);
        }
        return result;
    }
}

export class TestClock {
    private value = new Date("2026-07-26T10:00:00.000Z");

    now(): Date {
        return new Date(this.value);
    }

    advance(milliseconds: number): void {
        this.value = new Date(this.value.getTime() + milliseconds);
    }
}

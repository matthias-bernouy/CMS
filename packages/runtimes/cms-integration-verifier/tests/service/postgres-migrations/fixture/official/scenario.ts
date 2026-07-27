import { SQL } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    runDurableMigrationUpgrade,
    type IntegrationInstallationRepository,
    type IntegrationMigrationPhase,
    type IntegrationMigrationRuntime,
} from "@bernouy/cms-integrations";
import { RealPostgresSupabaseManagementApi } from "./managementApi";
import { createDurableInstallationRepository } from "./repository";
import { createTrackedOfficialMigrationRuntime, officialManagementAccessToken } from "./runtime";
import { prepareOfficialSourceInstallation, readOfficialMigrationDatabaseEvidence, targetPackageRoot } from "./setup";
import type { OfficialUpgradeHarness } from "./harness";

export class OfficialUpgradeScenario {
    readonly executionCounts = new Map<IntegrationMigrationPhase, number>();
    firstRepository?: IntegrationInstallationRepository;
    resumedRepository?: IntegrationInstallationRepository;
    firstRuntime?: IntegrationMigrationRuntime;
    resumedRuntime?: IntegrationMigrationRuntime;

    private constructor(
        readonly phase: IntegrationMigrationPhase,
        readonly sourceEvidence: Awaited<ReturnType<typeof readOfficialMigrationDatabaseEvidence>>,
        readonly management: RealPostgresSupabaseManagementApi,
        private readonly harness: OfficialUpgradeHarness,
        private readonly directory: string,
        private readonly installationStore: string,
        private readonly database: SQL,
        private readonly lease: Awaited<ReturnType<OfficialUpgradeHarness["databaseProvider"]["acquire"]>>,
    ) {}

    static async create(
        harness: OfficialUpgradeHarness,
        phase: IntegrationMigrationPhase,
        directory: string,
    ): Promise<OfficialUpgradeScenario> {
        await mkdir(directory, { recursive: true });
        const lease = await harness.databaseProvider.acquire(
            {
                candidateId: `photo-albums-runtime-${phase}`,
                packageDigest: harness.release.target.digest,
                verificationDigest: "f".repeat(64),
            },
            new AbortController().signal,
        );
        const database = new SQL(lease.credential.connectionUri, { max: 1 });
        try {
            const management = new RealPostgresSupabaseManagementApi(database, officialManagementAccessToken());
            const installationStore = join(directory, "installations.bin");
            const installations = await createDurableInstallationRepository(installationStore);
            await prepareOfficialSourceInstallation({
                database,
                installations,
                management,
                release: harness.release,
                sourcePackage: harness.sourcePackage,
                targetPackage: harness.targetPackage,
            });
            const sourceEvidence = await readOfficialMigrationDatabaseEvidence(database);
            management.resetMigrationObservations();
            return new OfficialUpgradeScenario(
                phase,
                sourceEvidence,
                management,
                harness,
                directory,
                installationStore,
                database,
                lease,
            );
        } catch (error) {
            await database.close().catch(() => undefined);
            await lease.release().catch(() => undefined);
            await rm(directory, { recursive: true, force: true });
            throw error;
        }
    }

    async failAfterRemoteSuccess() {
        this.firstRepository = await createDurableInstallationRepository(this.installationStore);
        this.firstRuntime = createTrackedOfficialMigrationRuntime({
            installations: this.firstRepository,
            management: this.management,
            executionCounts: this.executionCounts,
            failAfter: this.phase,
        });
        return await this.run(this.firstRepository, this.firstRuntime, this.harness.targetPackage);
    }

    async resumeFromReconstructedComposition() {
        const packages = await this.harness.reopenedPackages();
        this.resumedRepository = await createDurableInstallationRepository(this.installationStore);
        this.resumedRuntime = createTrackedOfficialMigrationRuntime({
            installations: this.resumedRepository,
            management: this.management,
            executionCounts: this.executionCounts,
        });
        const result = await this.run(this.resumedRepository, this.resumedRuntime, packages.target);
        return { packages, result };
    }

    async databaseEvidence() {
        return await readOfficialMigrationDatabaseEvidence(this.database);
    }

    async adoptedInstallation() {
        const repository = await createDurableInstallationRepository(this.installationStore);
        const installation = await repository.get("photo-albums");
        if (!installation) {
            throw new Error("Official Photo Albums adoption was not persisted");
        }
        return installation;
    }

    async installation() {
        const repository = this.resumedRepository ?? this.firstRepository;
        if (!repository) {
            throw new Error("Official migration scenario has no composed installation repository");
        }
        const installation = await repository.get("photo-albums");
        if (!installation) {
            throw new Error("Official Photo Albums installation disappeared");
        }
        return installation;
    }

    async close(): Promise<void> {
        await this.database.close().catch(() => undefined);
        await this.lease.release().catch(() => undefined);
        await rm(this.directory, { recursive: true, force: true });
    }

    private async run(
        installations: IntegrationInstallationRepository,
        runtime: IntegrationMigrationRuntime,
        materialized: typeof this.harness.targetPackage,
    ) {
        const installation = await installations.get("photo-albums");
        if (!installation) {
            throw new Error("Official Photo Albums installation is missing");
        }
        return await runDurableMigrationUpgrade({
            installations,
            installation,
            targetDefinition: this.harness.release.targetPackage.definition,
            resolvedPackage: targetPackageRoot(this.harness.release, materialized),
            runtime,
            leaseMs: 300_000,
        });
    }
}

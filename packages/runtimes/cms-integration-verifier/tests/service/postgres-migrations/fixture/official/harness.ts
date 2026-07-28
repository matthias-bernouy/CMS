import { chmod, lstat, mkdtemp, opendir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import { FsIntegrationPackageCache, type MaterializedIntegrationPackage } from "@bernouy/cms-integration-packages/fs";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../../../src/runtime/providers/postgres";
import { startMigrationPostgres } from "../harness";
import { OfficialUpgradeScenario } from "./scenario";
import { loadOfficialPhotoAlbumsRelease, type OfficialPhotoAlbumsRelease } from "./release";

export const OFFICIAL_MIGRATION_PHASES: readonly IntegrationMigrationPhase[] = [
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

export class OfficialUpgradeHarness {
    private constructor(
        readonly release: OfficialPhotoAlbumsRelease,
        readonly sourcePackage: MaterializedIntegrationPackage,
        readonly targetPackage: MaterializedIntegrationPackage,
        private readonly root: string,
        private readonly cacheRoot: string,
        private readonly postgres: Awaited<ReturnType<typeof startMigrationPostgres>>,
        readonly databaseProvider: Awaited<ReturnType<typeof createDisposableVerificationDatabaseProviderFromEnv>>,
    ) {}

    static async create(): Promise<OfficialUpgradeHarness> {
        const postgres = await startMigrationPostgres();
        let root: string | undefined;
        try {
            root = await mkdtemp(join(tmpdir(), "cms-official-runtime-migration-"));
            const release = await loadOfficialPhotoAlbumsRelease();
            const cacheRoot = join(root, "package-cache");
            const cache = new FsIntegrationPackageCache({ root: cacheRoot });
            const sourcePackage = await cache.materialize(release.sourcePackage.package, {
                kind: "photo-albums",
                version: "1.0.0",
                digest: release.source.digest,
            });
            const targetPackage = await cache.materialize(release.targetPackage.package, {
                kind: "photo-albums",
                version: "1.1.0",
                digest: release.target.digest,
            });
            const databaseProvider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            return new OfficialUpgradeHarness(
                release,
                sourcePackage,
                targetPackage,
                root,
                cacheRoot,
                postgres,
                databaseProvider,
            );
        } catch (error) {
            const cleanup = await Promise.allSettled([postgres.close(), ...(root ? [removeHarnessRoot(root)] : [])]);
            const failures = cleanup.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
            if (failures.length) {
                throw new AggregateError(
                    [error, ...failures],
                    "Official migration harness creation and cleanup failed",
                );
            }
            throw error;
        }
    }

    async createScenario(phase: IntegrationMigrationPhase): Promise<OfficialUpgradeScenario> {
        return await OfficialUpgradeScenario.create(this, phase, join(this.root, `scenario-${phase}`));
    }

    async reopenedPackages(): Promise<{
        source: MaterializedIntegrationPackage;
        target: MaterializedIntegrationPackage;
    }> {
        const cache = new FsIntegrationPackageCache({ root: this.cacheRoot });
        const source = await cache.get(this.release.source.digest);
        const target = await cache.get(this.release.target.digest);
        if (!source || !target) {
            throw new Error("Official migration packages disappeared from the durable cache");
        }
        return { source, target };
    }

    async close(): Promise<void> {
        try {
            await removeHarnessRoot(this.root);
        } finally {
            await this.postgres.close();
        }
    }
}

async function removeHarnessRoot(root: string): Promise<void> {
    await makeDirectoriesOwnerWritable(root);
    await rm(root, { recursive: true, force: true });
}

async function makeDirectoriesOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!metadata || !metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o700);
    const entries = await opendir(path);
    for await (const entry of entries) {
        if (entry.isDirectory()) {
            await makeDirectoriesOwnerWritable(join(path, entry.name));
        }
    }
}

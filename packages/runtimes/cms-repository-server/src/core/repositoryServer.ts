import {
    SnapshotIntegrationDefinitionRepository,
    SnapshotIntegrationPackageSource,
} from "@bernouy/cms-integration-registry/fs";
import type { IntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry";
import {
    RepositoryCms,
    type PublicPackageDownloadProtection,
    type RepositoryCompatibilityReader,
    type PublicRepositoryReadObserver,
} from "@bernouy/cms-repository";
import type { Middleware, Runner } from "@bernouy/http-runner";
import type { RepositoryCatalogRefreshResult, RepositoryCatalogRuntime } from "./catalogRuntime";
import { mountRepositoryHealthRoutes } from "./healthRoutes";

export const REPOSITORY_PUBLIC_BASE_PATH = "/.cms/repository";
export const REPOSITORY_MANAGEMENT_BASE_PATH = "/.cms/repository-management";

export type RepositoryManagementSurfaceMount = (runner: Runner) => void;

export type RepositoryServerConfig = Readonly<{
    publicRunner: Runner;
    managementRunner: Runner;
    publicPort: number;
    managementPort: number;
    catalog: RepositoryCatalogRuntime;
    loadCatalog: () => Promise<IntegrationRegistryCatalogSnapshot>;
    packageDownloadProtection: PublicPackageDownloadProtection;
    integrationCompatibility?: RepositoryCompatibilityReader;
    observePublicRead?: PublicRepositoryReadObserver;
    managementGuard: Middleware;
    mountManagement: RepositoryManagementSurfaceMount;
    gracefulStopTimeoutMs?: number;
}>;

export type RepositoryServer = Readonly<{
    refreshCatalog(): Promise<RepositoryCatalogRefreshResult>;
    stop(): Promise<void>;
}>;

export function startRepositoryServer(config: RepositoryServerConfig): RepositoryServer {
    if (!config.catalog.status().ready) {
        throw new Error("Cannot start integration repository listeners without a valid catalog snapshot");
    }
    const packages = new SnapshotIntegrationPackageSource({ snapshots: config.catalog });
    const definitions = new SnapshotIntegrationDefinitionRepository({ snapshots: config.catalog, packages });

    mountRepositoryHealthRoutes(config.publicRunner, config.catalog);
    mountRepositoryHealthRoutes(config.managementRunner, config.catalog);
    config.publicRunner.group(REPOSITORY_PUBLIC_BASE_PATH, (runner) => {
        new RepositoryCms({
            runner,
            integrationCatalog: definitions,
            integrationCompatibility: config.integrationCompatibility,
            integrationPackages: packages,
            packageDownloadProtection: config.packageDownloadProtection,
            observeRead: config.observePublicRead,
        });
    });
    config.managementRunner.group(REPOSITORY_MANAGEMENT_BASE_PATH, config.mountManagement, [config.managementGuard]);

    let stopPromise: Promise<void> | undefined;
    try {
        config.publicRunner.start(config.publicPort);
        config.managementRunner.start(config.managementPort);
    } catch (error) {
        config.publicRunner.stop();
        config.managementRunner.stop();
        throw error;
    }
    return Object.freeze({
        refreshCatalog: () => config.catalog.refresh(config.loadCatalog),
        stop() {
            stopPromise ??= stopRunners(config);
            return stopPromise;
        },
    });
}

async function stopRunners(config: RepositoryServerConfig): Promise<void> {
    const timeout = config.gracefulStopTimeoutMs;
    await Promise.all([stopRunner(config.publicRunner, timeout), stopRunner(config.managementRunner, timeout)]);
}

async function stopRunner(runner: Runner, timeout: number | undefined): Promise<void> {
    if (runner.stopGracefully) {
        await runner.stopGracefully(timeout);
    } else {
        runner.stop();
    }
}

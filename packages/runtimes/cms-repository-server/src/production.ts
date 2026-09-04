import type { IntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import {
    createRepositoryMaintenanceGuard,
    createRepositoryManagementGuard,
    createRepositoryWorkerGuard,
} from "@bernouy/cms-repository-management";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import { startRepositoryWithCandidateGarbageCollection } from "./core/candidates/garbageCollectionServer";
import {
    createProductionRepositoryOperationalTelemetry,
    productionPackageDownloadProtection,
} from "./core/productionSupport";
import {
    assertDistinctRepositoryCredentials,
    readRepositoryMaintenanceToken,
    readRepositoryManagementToken,
    readRepositoryWorkerCapabilitySigningKey,
    readRepositoryWorkerToken,
} from "./credentials";
import { createProductionRepositoryManagement } from "./management";
import { productionMigrationVerificationEnvironment, productionReleaseAdmissionPolicy } from "./core/candidates/policy";
import { validateRepositoryRegistryRoot } from "./registryRoot";
import { startRepositoryServer, type RepositoryServer } from "./core/repositoryServer";
import { readRepositoryRuntimeEnv, type RepositoryRuntimeEnvSource } from "./runtimeEnv";

export async function startProductionRepositoryServer(source: RepositoryRuntimeEnvSource): Promise<RepositoryServer> {
    const env = readRepositoryRuntimeEnv(source);
    await validateRepositoryRegistryRoot(env.registryRoot);
    const [managementToken, maintenanceToken, workerToken, workerCapabilitySigningKey] = await Promise.all([
        readRepositoryManagementToken(env.managementTokenFile),
        readRepositoryMaintenanceToken(env.maintenanceTokenFile),
        readRepositoryWorkerToken(env.workerTokenFile),
        readRepositoryWorkerCapabilitySigningKey(env.workerCapabilityKeyFile),
    ]);
    assertDistinctRepositoryCredentials(managementToken, maintenanceToken, workerToken, workerCapabilitySigningKey);
    const catalog = new RepositoryCatalogRuntime();
    const loadCatalog = (): Promise<IntegrationRegistryCatalogSnapshot> =>
        buildFsIntegrationRegistryCatalogSnapshot({ root: env.registryRoot });
    const initial = await catalog.refresh(loadCatalog);
    if (!initial.applied) {
        throw new Error("Initial integration repository catalog snapshot could not be built");
    }
    const telemetry = createProductionRepositoryOperationalTelemetry();
    const migrationEnvironment = await productionMigrationVerificationEnvironment(env.verifierRunner);
    const repositoryManagement = await createProductionRepositoryManagement({
        root: env.registryRoot,
        catalog,
        telemetry,
        candidateProtocol: {
            capabilitySigningKey: workerCapabilitySigningKey,
            candidateTtlMs: env.candidateTtlMs,
            leaseDurationMs: env.workerLeaseDurationMs,
        },
        candidateAdmissionPolicy: await productionReleaseAdmissionPolicy(env.verifierRunner, migrationEnvironment),
        candidateMigrationEnvironment: migrationEnvironment,
    });

    const managementGuard = createRepositoryManagementGuard({
        serviceToken: managementToken,
        servicePrincipal: "repository-operator",
        rateLimiter: new InMemoryRateLimiter({
            limit: env.managementRateLimit,
            windowSeconds: env.managementRateLimitWindowSeconds,
        }),
    });
    const maintenanceGuard = createRepositoryMaintenanceGuard({
        serviceToken: maintenanceToken,
        servicePrincipal: "official-maintenance",
        rateLimiter: new InMemoryRateLimiter({
            limit: env.managementRateLimit,
            windowSeconds: env.managementRateLimitWindowSeconds,
        }),
    });
    const workerGuard = createRepositoryWorkerGuard({
        serviceToken: workerToken,
        servicePrincipal: "integration-verifier-supervisor",
        rateLimiter: new InMemoryRateLimiter({
            limit: env.workerRateLimit,
            windowSeconds: env.workerRateLimitWindowSeconds,
        }),
    });
    const packageDownloadProtection = productionPackageDownloadProtection(env, (observation) =>
        telemetry.observePublicPackageRead(observation),
    );
    return await startRepositoryWithCandidateGarbageCollection({
        root: env.registryRoot,
        policy: env,
        telemetry,
        startServer: () =>
            startRepositoryServer({
                publicRunner: new BunRunner(),
                managementRunner: new BunRunner(),
                publicPort: env.publicPort,
                managementPort: env.managementPort,
                catalog,
                loadCatalog,
                packageDownloadProtection,
                observePublicRead: (observation) => telemetry.observePublicRead(observation),
                integrationCompatibility: repositoryManagement.compatibility,
                integrationReleases: repositoryManagement.releases,
                integrationVerificationBundles: repositoryManagement.verificationBundles,
                integrationSchemaBaselines: repositoryManagement.schemaBaselines,
                managementGuard,
                mountManagement: repositoryManagement.mount,
                maintenance: { guard: maintenanceGuard, mount: repositoryManagement.mountMaintenance },
                worker: {
                    guard: workerGuard,
                    mountAuthenticated: repositoryManagement.mountWorkerAuthenticated,
                    mountCapabilities: repositoryManagement.mountWorkerCapabilities,
                },
                gracefulStopTimeoutMs: env.gracefulStopTimeoutMs,
            }),
    });
}

export {
    createProductionRepositoryOperationalTelemetry,
    productionPackageDownloadProtection,
} from "./core/productionSupport";

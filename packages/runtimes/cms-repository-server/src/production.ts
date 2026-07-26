import { randomUUID } from "node:crypto";
import {
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    IntegrationRegistryCatalogSnapshotReference,
    type IntegrationRegistryCatalogSnapshot,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsOfficialIntegrationRegistryBootstrapPublisher,
} from "@bernouy/cms-integration-registry/fs";
import {
    buildOfficialRepositoryBootstrapPlan,
    loadOfficialRepositoryBootstrapEvidence,
    OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
} from "@bernouy/cms-official-integrations/publication";
import { createRepositoryMaintenanceGuard, createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import type { PublicPackageDownloadProtection, PublicPackageReadObservation } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import {
    createConsoleRepositoryOperationLogSink,
    RepositoryOperationalTelemetry,
} from "./core/observability/telemetry";
import {
    assertDistinctRepositoryCredentials,
    readRepositoryMaintenanceToken,
    readRepositoryManagementToken,
} from "./credentials";
import { createProductionRepositoryManagement } from "./management";
import {
    bootstrapRepositoryRegistryIfEmpty,
    type EmptyRegistryBootstrap,
    validateRepositoryRegistryRoot,
} from "./registryRoot";
import { startRepositoryServer, type RepositoryServer } from "./core/repositoryServer";
import { readRepositoryRuntimeEnv, type RepositoryRuntimeEnvSource } from "./runtimeEnv";

export async function startProductionRepositoryServer(
    source: RepositoryRuntimeEnvSource,
    options: Readonly<{
        bootstrapEmptyRegistry?: EmptyRegistryBootstrap;
    }> = {},
): Promise<RepositoryServer> {
    const env = readRepositoryRuntimeEnv(source);
    await validateRepositoryRegistryRoot(env.registryRoot);
    await bootstrapRepositoryRegistryIfEmpty(
        env.registryRoot,
        options.bootstrapEmptyRegistry ?? prepareOfficialRepositoryBootstrap,
    );
    const [managementToken, maintenanceToken] = await Promise.all([
        readRepositoryManagementToken(env.managementTokenFile),
        readRepositoryMaintenanceToken(env.maintenanceTokenFile),
    ]);
    assertDistinctRepositoryCredentials(managementToken, maintenanceToken);
    const catalog = new RepositoryCatalogRuntime();
    const loadCatalog = (): Promise<IntegrationRegistryCatalogSnapshot> =>
        buildFsIntegrationRegistryCatalogSnapshot({ root: env.registryRoot });
    const initial = await catalog.refresh(loadCatalog);
    if (!initial.applied) {
        throw new Error("Initial integration repository catalog snapshot could not be built");
    }
    const telemetry = createProductionRepositoryOperationalTelemetry();
    const officialEvidence = await loadOfficialRepositoryBootstrapEvidence();
    const repositoryManagement = await createProductionRepositoryManagement({
        root: env.registryRoot,
        catalog,
        telemetry,
        baselineImports: {
            approval: OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
            approvedTargets: officialEvidence.reviewedSchemaBaselines.map(
                ({ kind, version, packageDigest, connectorKey, lineageId }) => ({
                    kind,
                    version,
                    packageDigest,
                    connectorKey,
                    lineageId,
                }),
            ),
        },
    });

    const managementGuard = createRepositoryManagementGuard({
        serviceToken: managementToken,
        servicePrincipal: "management-cms",
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
    const packageDownloadProtection = productionPackageDownloadProtection(env, (observation) =>
        telemetry.observePublicPackageRead(observation),
    );
    return startRepositoryServer({
        publicRunner: new BunRunner(),
        managementRunner: new BunRunner(),
        publicPort: env.publicPort,
        managementPort: env.managementPort,
        catalog,
        loadCatalog,
        packageDownloadProtection,
        observePublicRead: (observation) => telemetry.observePublicRead(observation),
        integrationCompatibility: repositoryManagement.compatibility,
        managementGuard,
        mountManagement: repositoryManagement.mount,
        maintenance: { guard: maintenanceGuard, mount: repositoryManagement.mountMaintenance },
        gracefulStopTimeoutMs: env.gracefulStopTimeoutMs,
    });
}

export const prepareOfficialRepositoryBootstrap: EmptyRegistryBootstrap = async (root) => {
    const plan = await buildOfficialRepositoryBootstrapPlan();
    const snapshots = new IntegrationRegistryCatalogSnapshotReference(
        await buildFsIntegrationRegistryCatalogSnapshot({ root }),
    );
    const publisher = new FsOfficialIntegrationRegistryBootstrapPublisher({
        root,
        snapshots,
        compatibility: new IntegrationCompatibilityEvaluator({
            identity: { name: "cms-repository-server-bootstrap", version: "1.0.0" },
            now: () => new Date().toISOString(),
            createReportId: () => randomUUID(),
        }),
        mutations: new InMemoryIntegrationRegistryMutationCoordinator(),
        baselineApproval: OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
    });
    const preparation = await publisher.prepare(plan);
    return {
        planDigest: preparation.planDigest,
        commit: async () => {
            await publisher.publishPrepared(preparation);
        },
    };
};

export function productionPackageDownloadProtection(
    env: ReturnType<typeof readRepositoryRuntimeEnv>,
    observe?: (observation: PublicPackageReadObservation) => void,
): PublicPackageDownloadProtection {
    if (env.clientAddressMode === "disabled") {
        return { clientAddressPolicy: { mode: "disabled" }, ...(observe ? { observe } : {}) };
    }
    const clientAddressPolicy =
        env.clientAddressMode === "trusted-proxy"
            ? ({ mode: "trusted-proxy", trustedProxyHops: env.trustedProxyHops } as const)
            : ({ mode: "direct" } as const);
    return {
        clientAddressPolicy,
        rateLimiter: new InMemoryRateLimiter({
            limit: env.packageDownloadLimit,
            windowSeconds: env.packageDownloadWindowSeconds,
        }),
        ...(observe ? { observe } : {}),
    };
}

export function createProductionRepositoryOperationalTelemetry(
    write?: (line: string) => void,
): RepositoryOperationalTelemetry {
    return new RepositoryOperationalTelemetry({
        log: createConsoleRepositoryOperationLogSink(write),
    });
}

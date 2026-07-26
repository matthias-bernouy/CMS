import { randomUUID } from "node:crypto";
import {
    createIntegrationRegistryCatalogSnapshot,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    IntegrationRegistryCatalogSnapshotReference,
    type IntegrationRegistryCatalogSnapshot,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsOfficialIntegrationRegistryBootstrapPublisher,
} from "@bernouy/cms-integration-registry/fs";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";
import { createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import type { PublicPackageDownloadProtection } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import { readRepositoryManagementToken } from "./credentials";
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
    const token = await readRepositoryManagementToken(env.managementTokenFile);
    const catalog = new RepositoryCatalogRuntime();
    const loadCatalog = (): Promise<IntegrationRegistryCatalogSnapshot> =>
        buildFsIntegrationRegistryCatalogSnapshot({ root: env.registryRoot });
    const initial = await catalog.refresh(loadCatalog);
    if (!initial.applied) {
        throw new Error("Initial integration repository catalog snapshot could not be built");
    }
    const repositoryManagement = await createProductionRepositoryManagement({
        root: env.registryRoot,
        catalog,
    });

    const managementGuard = createRepositoryManagementGuard({
        serviceToken: token,
        servicePrincipal: "management-cms",
        rateLimiter: new InMemoryRateLimiter({
            limit: env.managementRateLimit,
            windowSeconds: env.managementRateLimitWindowSeconds,
        }),
    });
    const packageDownloadProtection = productionPackageDownloadProtection(env);
    return startRepositoryServer({
        publicRunner: new BunRunner(),
        managementRunner: new BunRunner(),
        publicPort: env.publicPort,
        managementPort: env.managementPort,
        catalog,
        loadCatalog,
        packageDownloadProtection,
        integrationCompatibility: repositoryManagement.compatibility,
        managementGuard,
        mountManagement: repositoryManagement.mount,
        gracefulStopTimeoutMs: env.gracefulStopTimeoutMs,
    });
}

export const prepareOfficialRepositoryBootstrap: EmptyRegistryBootstrap = async (root) => {
    const packages = await buildOfficialIntegrationPackages();
    const snapshots = new IntegrationRegistryCatalogSnapshotReference(
        createIntegrationRegistryCatalogSnapshot({ entries: [] }),
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
    });
    const preparation = await publisher.prepare(packages.map(({ package: integrationPackage }) => integrationPackage));
    return {
        commit: async () => {
            const results = await publisher.publishPrepared(preparation);
            if (
                results.length !== packages.length ||
                results.some(
                    (result, index) =>
                        result.kind !== packages[index]?.kind ||
                        result.version !== packages[index]?.version ||
                        result.digest !== packages[index]?.digest,
                )
            ) {
                throw new Error("Official integration repository bootstrap publication diverged from its preparation");
            }
        },
    };
};

export function productionPackageDownloadProtection(
    env: ReturnType<typeof readRepositoryRuntimeEnv>,
): PublicPackageDownloadProtection {
    if (env.clientAddressMode === "disabled") {
        return { clientAddressPolicy: { mode: "disabled" } };
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
    };
}

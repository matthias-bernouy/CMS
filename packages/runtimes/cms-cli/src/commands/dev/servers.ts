import { InMemoryAnalyticsStore, ValidatingAnalyticsStore } from "@bernouy/cms-analytics";
import { ControlCms } from "@bernouy/cms-control";
import { P9R_CACHE } from "@bernouy/cms-content";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { LocalFsCmsFilesBlob } from "@bernouy/cms-files";
import { RepositoryCms } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { startDevScheduledTriggers } from "../../dev-server/runtime/scheduledTriggers";
import { createLocalEndpointPerformance } from "../../dev-server/runtime/endpointPerformance";
import { createLocalSourceImageComposition } from "../../dev-server/runtime/sourceImages";
import { createBlocRegistry } from "../../dev-server/watch/index";
import type { ReloadEmitter } from "../../dev-server/watch/types";
import type { LocalBlocs } from "./blocs";
import type { DevFlags, LocalRuntimeOptions } from "./flags";
import { sseHandler } from "./reload";
import type { LocalServices } from "./services";

type ServerOptions = {
    siteDir: string;
    flags: DevFlags;
    runtime: LocalRuntimeOptions;
    blocs: LocalBlocs;
    reload: ReloadEmitter;
    services: LocalServices;
};

export async function startLocalServers(options: ServerOptions) {
    const { flags, services } = options;
    const scheduledTriggers = flags.workers
        ? startDevScheduledTriggers({
              functions: services.functions,
              sources: services.deliverySources,
              deps: { resolveSecret: services.resolveSecret, identities: services.identities },
              users: services.users,
              installations: services.integrationInstallations,
              triggers: services.triggers,
          })
        : undefined;
    await scheduledTriggers?.ready;
    const analytics = new ValidatingAnalyticsStore(new InMemoryAnalyticsStore());
    const endpointPerformance = await createLocalEndpointPerformance(
        options.runtime.mode,
        services.integrationConnectorDeployers,
    );
    const sourceImages = await createLocalSourceImageComposition({
        siteDir: options.siteDir,
        scope: `http://${flags.publicHost}:${flags.deliveryPort}`,
        enabled: flags.sourceImages,
    });
    const analyticsVisitorSecret = crypto.randomUUID();
    const runner = new BunRunner();
    runner.addEndpoint("GET", "/dev/reload", sseHandler(options.reload));

    const cms = new ControlCms(
        runner,
        services.repo,
        services.auth,
        {
            deliveryUrl: `http://${flags.publicHost}:${flags.deliveryPort}`,
            analyticsCompliance: {
                cmsVersion: "0.1.0-dev",
                secretReady: true,
                siteScope: `http://${flags.publicHost}:${flags.deliveryPort}`,
                trustProxy: false,
                trustedProxyVerified: false,
                secureCookie: false,
                optOutUrl: `http://${flags.publicHost}:${flags.deliveryPort}/.cms/privacy/analytics`,
            },
            publicAuth: { ...services.publicAuth, allowSignup: false },
            integrationCatalog: services.integrationCatalog,
            integrationPackageResolver: services.integrationPackageResolver,
            integrationInstallations: services.integrationInstallations,
            integrationConnectorProviders: services.integrationConnectorProviders,
            integrationConnectorDeployers: services.integrationConnectorDeployers,
            integrationProvisioners: services.integrationProvisioners,
            dashboards: services.dashboards,
            relations: services.relations,
            functions: services.functions,
            triggers: services.triggers,
            scheduledTriggers: {
                enabled: flags.workers,
                ...(scheduledTriggers ? { runNow: scheduledTriggers.runNow } : {}),
            },
            identities: services.identities,
            sourceOverlays: services.sourceOverlays,
            endpointPerformanceReports: endpointPerformance.reports,
            sourceTelemetry: endpointPerformance.controlTelemetry,
            sourceImageInterceptor: sourceImages.sourceImageInterceptor,
            responsivePublicSourceImagesEnabled: sourceImages.responsivePublicSourceImagesEnabled,
            responsivePrivateSourceImagesEnabled: sourceImages.responsivePrivateSourceImagesEnabled,
            sourceTrustedConnectorTarget: endpointPerformance.trustedConnectorTarget,
            integrationBlocRepository: services.integrationBlocRepository,
        },
        undefined,
        services.secrets,
        services.filesMetadata,
        services.files,
        services.users,
        services.identityProviders,
        services.pats,
        services.credentials,
        services.sources,
        analytics,
        services.roles,
    );
    await cms.ready;

    options.reload.subscribe((tag) => {
        cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);
        cms.cache.delete(P9R_CACHE.EDITOR_VIEW_SCRIPT);
        cms.cache.delete(P9R_CACHE.bloc(tag));
        cms.cache.deleteMatching((key) => key.startsWith(P9R_CACHE.BLOCSET_PREFIX));
        console.log(`[watch] Rebuilt ${tag} — caches invalidated, browser reload signaled.`);
    });
    const registry = createBlocRegistry(
        `${options.siteDir}/blocs`,
        options.blocs.authored,
        options.blocs.built,
        options.reload,
    );
    runner.start(flags.port);

    const deliveryRunner = new BunRunner();
    const repositoryPackageDownloadRateLimit = new InMemoryRateLimiter({ limit: 60, windowSeconds: 60 });
    deliveryRunner.group("/.cms/repository", (repositoryRunner) => {
        new RepositoryCms({
            runner: repositoryRunner,
            integrationCatalog: services.publicRepositoryCatalog,
            integrationPackages: services.publicRepositoryPackages,
            packageDownloadProtection: {
                clientAddressPolicy: { mode: "direct" },
                rateLimiter: repositoryPackageDownloadRateLimit,
            },
        });
    });
    const variantStore = new LocalFsCmsFilesBlob(`${options.siteDir}/.cms-variants`);
    new DeliveryCms({
        runner: deliveryRunner,
        repository: services.repo,
        filesMetadata: services.filesMetadata,
        filesBlob: services.files,
        variantStore,
        sources: services.sources,
        sourceOverlays: services.sourceOverlays,
        sourceTelemetry: endpointPerformance.deliveryTelemetry,
        sourceImageInterceptor: sourceImages.sourceImageInterceptor,
        responsivePublicSourceImagesEnabled: sourceImages.responsivePublicSourceImagesEnabled,
        responsivePrivateSourceImagesEnabled: sourceImages.responsivePrivateSourceImagesEnabled,
        sourceTrustedConnectorTarget: endpointPerformance.trustedConnectorTarget,
        functions: services.functions,
        triggers: services.triggers,
        identities: services.identities,
        integrationInstallations: services.integrationInstallations,
        analytics,
        analyticsVisitorSecret,
        analyticsSiteScope: `http://${flags.publicHost}:${flags.deliveryPort}`,
        analyticsCmsVersion: "0.1.0-dev",
        sourceResolveSecret: services.resolveSecret,
        roles: services.roles,
        auth: services.publicAuth,
    });
    deliveryRunner.start(flags.deliveryPort);
    let stopping: Promise<void> | null = null;
    return {
        registry,
        scheduledTriggers,
        stop() {
            stopping ??= (async () => {
                endpointPerformance.stopFlusher();
                await Promise.all([runner.stopGracefully(), deliveryRunner.stopGracefully()]);
                await endpointPerformance.flush();
                await scheduledTriggers?.stop();
                await sourceImages.dispose();
            })();
            return stopping;
        },
    };
}

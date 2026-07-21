import { ControlCms } from "@bernouy/cms-control";
import { P9R_CACHE } from "@bernouy/cms-content";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { LocalFsCmsFilesBlob } from "@bernouy/cms-files";
import { RepositoryCms } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { startDevSystemFunctionWorkers } from "../../dev-server/runtime/systemFunctionWorkers";
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
    const runner = new BunRunner();
    runner.addEndpoint("GET", "/dev/reload", sseHandler(options.reload));
    runner.group("/.cms/repository", (repositoryRunner) => {
        new RepositoryCms({
            runner: repositoryRunner,
            integrationCatalog: services.integrationRepositoryCatalog,
        });
    });

    const cms = new ControlCms(
        runner,
        services.repo,
        services.auth,
        {
            deliveryUrl: `http://${flags.publicHost}:${flags.deliveryPort}`,
            publicAuth: { ...services.publicAuth, allowSignup: false },
            integrationCatalog: services.integrationCatalog,
            integrationInstallations: services.integrationInstallations,
            integrationConnectorProviders: services.integrationConnectorProviders,
            integrationConnectorDeployers: services.integrationConnectorDeployers,
            dashboards: services.dashboards,
            relations: services.relations,
            functions: services.functions,
            triggers: services.triggers,
            identities: services.identities,
            sourceOverlays: services.sourceOverlays,
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
        undefined,
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
    const variantStore = new LocalFsCmsFilesBlob(`${options.siteDir}/.cms-variants`);
    new DeliveryCms({
        runner: deliveryRunner,
        repository: services.repo,
        filesMetadata: services.filesMetadata,
        filesBlob: services.files,
        variantStore,
        sources: services.deliverySources,
        functions: services.functions,
        triggers: services.triggers,
        identities: services.identities,
        integrationInstallations: services.integrationInstallations,
        sourceResolveSecret: services.resolveSecret,
        roles: services.roles,
        auth: services.publicAuth,
    });
    deliveryRunner.start(flags.deliveryPort);
    const systemFunctionWorkers = flags.workers
        ? startDevSystemFunctionWorkers({
              functions: services.functions,
              sources: services.deliverySources,
              deps: { resolveSecret: services.resolveSecret, identities: services.identities },
          })
        : undefined;

    return { registry, systemFunctionWorkers };
}

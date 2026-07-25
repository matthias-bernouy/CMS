import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
} from "@bernouy/cms-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { RepositoryCms } from "@bernouy/cms-repository";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { BunRunner } from "@bernouy/http-runner";
import { createProductionIntegrationServices } from "../../../../src/runtime/integrations";
import { JsonIntegrationInstallationRepository } from "./persistentInstallations";

export type CmsProcessConfig = {
    cacheRoot: string;
    installationsPath: string;
    managementLog: string;
    repositoryFetchLog: string;
    repositoryUrl: string;
};

export async function startCmsFixture(config: CmsProcessConfig) {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const observedFetch = createObservedFetch(config, nativeFetch);
    globalThis.fetch = observedFetch;

    const providers = new InMemoryIntegrationConnectorProviderRepository({
        provider: "supabase",
        enabled: true,
        projectRef: "acceptance-project",
    });
    const secrets = new InMemorySecretStore();
    await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_acceptance_only");
    const integrations = createProductionIntegrationServices({
        providerRepository: providers,
        secrets,
        localRepositoryUrl: config.repositoryUrl,
        packageCacheDir: config.cacheRoot,
        packageFetch: observedFetch,
        environment: { P9R_INTEGRATION_REPOSITORY_URL: config.repositoryUrl },
    });
    await integrations.integrationPackageCache.init();

    const content = new InMemoryCmsRepository();
    const installations = new JsonIntegrationInstallationRepository(config.installationsPath);
    const sources = new InMemorySourceRepository();
    const roles = new InMemoryRolesRepository();
    const controlRunner = new BunRunner();
    const control = new ControlCms(
        controlRunner,
        content,
        new InMemoryAuthentication({ role: "admin" }),
        {
            integrationCatalog: integrations.integrationCatalog,
            integrationPackageResolver: integrations.integrationPackageResolver,
            integrationInstallations: installations,
            integrationConnectorProviders: providers,
            integrationConnectorDeployers: integrations.integrationConnectorDeployers,
            integrationProvisioners: integrations.integrationProvisioners,
        },
        undefined,
        secrets,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        sources,
        undefined,
        roles,
    );
    await control.ready;

    const deliveryRunner = new BunRunner();
    deliveryRunner.get("/health", () => Response.json({ ok: true, pid: process.pid }));
    deliveryRunner.group("/.cms/repository", (runner) => {
        new RepositoryCms({
            runner,
            integrationCatalog: integrations.integrationRepositoryCatalog,
            integrationPackages: integrations.integrationRepositoryPackages,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        });
    });
    new DeliveryCms({ runner: deliveryRunner, repository: content, integrationInstallations: installations });
    controlRunner.start(0);
    deliveryRunner.start(0);

    return {
        ready: { controlPort: controlRunner.port, deliveryPort: deliveryRunner.port },
        async stop() {
            await Promise.all([controlRunner.stopGracefully(1_000), deliveryRunner.stopGracefully(1_000)]);
        },
    };
}

function createObservedFetch(config: CmsProcessConfig, nativeFetch: typeof fetch): typeof fetch {
    const repositoryOrigin = new URL(config.repositoryUrl).origin;
    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin === repositoryOrigin) {
            await appendEvent(config.repositoryFetchLog, {
                pid: process.pid,
                method: init?.method ?? (input instanceof Request ? input.method : "GET"),
                url: url.href,
            });
            return await nativeFetch(input, init);
        }
        if (url.origin === "https://api.supabase.com") {
            await recordManagementRequest(config.managementLog, url, init);
            return new Response(null, { status: 201 });
        }
        return await nativeFetch(input, init);
    };
}

async function recordManagementRequest(path: string, url: URL, init?: RequestInit): Promise<void> {
    const body = init?.body;
    if (url.pathname.endsWith("/database/query") && typeof body === "string") {
        const parsed = JSON.parse(body) as { query: string };
        await appendEvent(path, { pid: process.pid, type: "sql", query: parsed.query });
        return;
    }
    if (url.pathname.endsWith("/functions/deploy") && body instanceof FormData) {
        const files = await Promise.all(
            body.getAll("file").map(async (file) => ({
                name: (file as File).name,
                content: await (file as Blob).text(),
            })),
        );
        await appendEvent(path, { pid: process.pid, type: "function", slug: url.searchParams.get("slug"), files });
    }
}

async function appendEvent(path: string, event: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}

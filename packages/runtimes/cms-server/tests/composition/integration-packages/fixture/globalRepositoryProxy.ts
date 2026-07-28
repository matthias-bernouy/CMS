import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { RepositoryCms } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { createProductionIntegrationServices } from "../../../../src/runtime/integrations";
import { writeRemoteIntegrationCatalog } from "./catalogFixture";

export type ObservedRepositoryRequest = Readonly<{
    source: "definition" | "package";
    method: string;
    authorization: string | null;
}>;

export async function globalRepositoryProxyFixture() {
    const root = await mkdtemp(join(tmpdir(), "cms-global-repository-"));
    const repositoryRoot = join(root, "repository");
    await writeRemoteIntegrationCatalog(repositoryRoot);
    const upstream = new BunRunner();
    const upstreamCatalog = new FsIntegrationDefinitionRepository(repositoryRoot);
    const upstreamPackages = new FsIntegrationPackageSource({
        locate: (kind, version) => upstreamCatalog.locateExactVersion(kind, version),
    });
    upstream.group("/.cms/repository", (runner) => {
        new RepositoryCms({
            runner,
            integrationCatalog: upstreamCatalog,
            integrationPackages: upstreamPackages,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        });
    });
    upstream.start(0);
    const upstreamUrl = `${origin(upstream)}/.cms/repository`;
    const requests: ObservedRepositoryRequest[] = [];
    const services = createProductionIntegrationServices({
        providerRepository: {} as never,
        secrets: {} as never,
        localRepositoryUrl: "http://127.0.0.1:9/.cms/repository",
        packageCacheDir: join(root, "cache"),
        environment: { P9R_INTEGRATION_REPOSITORY_URL: upstreamUrl },
        definitionFetch: observingFetch("definition", requests),
        packageFetch: observingFetch("package", requests),
    });

    const delivery = new BunRunner();
    delivery.get("/delivery-health", () => Response.json({ ok: true }));
    delivery.group("/.cms/repository", (runner) => {
        new RepositoryCms({
            runner,
            integrationCatalog: services.publicRepositoryCatalog,
            integrationPackages: services.publicRepositoryPackages,
            packageDownloadProtection: {
                clientAddressPolicy: { mode: "direct" },
                rateLimiter: new InMemoryRateLimiter({ limit: 1, windowSeconds: 60 }),
            },
        });
    });
    delivery.start(0);

    const control = new BunRunner();
    control.get("/control-health", () => Response.json({ ok: true }));
    control.start(0);
    let upstreamRunning = true;

    return {
        services,
        requests,
        deliveryOrigin: origin(delivery),
        controlOrigin: origin(control),
        stopUpstream() {
            if (upstreamRunning) {
                upstreamRunning = false;
                upstream.stop();
            }
        },
        async stop() {
            upstream.stop();
            delivery.stop();
            control.stop();
            await rm(root, { recursive: true, force: true });
        },
    };
}

function observingFetch(
    source: ObservedRepositoryRequest["source"],
    requests: ObservedRepositoryRequest[],
): typeof fetch {
    return (async (input, init) => {
        const request = input instanceof Request ? input : undefined;
        const headers = new Headers(init?.headers ?? request?.headers);
        requests.push({
            source,
            method: init?.method ?? request?.method ?? "GET",
            authorization: headers.get("authorization"),
        });
        return await fetch(input, init);
    }) as typeof fetch;
}

function origin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Repository test runner did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}

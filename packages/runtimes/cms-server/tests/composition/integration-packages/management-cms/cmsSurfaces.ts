import type { Authentication, Subject } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { RepositoryCms } from "@bernouy/cms-repository";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { BunRunner } from "@bernouy/http-runner";
import { HttpRepositoryCatalogReader, HttpRepositoryCompatibilityReader } from "../../../../src/repositoryCatalog";
import { HttpRepositoryManagementGateway } from "../../../../src/repositoryManagement/gateway";

export type CapturedRequest = Readonly<{
    method: string;
    url: string;
    authorization: string | null;
    body: string;
}>;

export type ManagementCmsSurfaces = Readonly<{
    controlOrigin: string;
    deliveryOrigin: string;
    browserRequests: CapturedRequest[];
    upstreamRequests: CapturedRequest[];
    stop(): Promise<void>;
}>;

type SurfaceOrigins = Readonly<{
    publicRepositoryBaseUrl: string;
    privateManagementBaseUrl: string;
    token: string;
}>;

export async function startManagementCmsSurfaces(origins: SurfaceOrigins): Promise<ManagementCmsSurfaces> {
    const browserRequests: CapturedRequest[] = [];
    const upstreamRequests: CapturedRequest[] = [];
    const controlRunner = new BunRunner();
    controlRunner.use(async (request, next) => {
        browserRequests.push(await captureRequest(request));
        return await next();
    });
    const gatewayFetch: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        upstreamRequests.push(await captureRequest(request));
        return await fetch(request);
    };
    const gateway = new HttpRepositoryManagementGateway({
        baseUrl: origins.privateManagementBaseUrl,
        token: origins.token,
        administratorSubjectIdentifier: "repository-owner",
        timeoutMs: 60_000,
        fetch: gatewayFetch,
    });
    const repository = new InMemoryCmsRepository();
    const control = new ControlCms(controlRunner, repository, new CookieAuthentication(), {
        repositoryManagement: {
            administratorSubjectIdentifier: "repository-owner",
            gateway,
        },
    });
    await control.ready;
    controlRunner.start(0);

    const deliveryRunner = new BunRunner();
    deliveryRunner.use(async (request, next) => {
        browserRequests.push(await captureRequest(request));
        return await next();
    });
    const publicCatalog = new HttpIntegrationDefinitionRepository({ baseUrl: origins.publicRepositoryBaseUrl });
    const publicPackages = new HttpIntegrationPackageSource({ baseUrl: origins.publicRepositoryBaseUrl });
    const publicCompatibility = new HttpRepositoryCompatibilityReader({ baseUrl: origins.publicRepositoryBaseUrl });
    deliveryRunner.group("/.cms/repository", (runner) => {
        new RepositoryCms({
            runner,
            integrationCatalog: publicCatalog,
            integrationCompatibility: publicCompatibility,
            integrationPackages: publicPackages,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        });
    });
    new DeliveryCms({
        runner: deliveryRunner,
        repository,
        publicPageProviders: [
            new RepositoryCatalogPageProvider(
                new HttpRepositoryCatalogReader({
                    catalog: publicCatalog,
                    baseUrl: origins.publicRepositoryBaseUrl,
                }),
            ),
        ],
    });
    deliveryRunner.start(0);

    return {
        controlOrigin: runnerOrigin(controlRunner),
        deliveryOrigin: runnerOrigin(deliveryRunner),
        browserRequests,
        upstreamRequests,
        async stop() {
            await Promise.all([controlRunner.stopGracefully(1_000), deliveryRunner.stopGracefully(1_000)]);
        },
    };
}

class CookieAuthentication implements Authentication<string> {
    readonly loginUrl = "/login";
    readonly logoutUrl = "/logout";
    readonly profileUrl = "/profile";

    buildLoginUrl(returnTo: string): string {
        return `/login?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `/logout?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(request: Request): Promise<Subject<string> | null> {
        const session = request.headers.get("cookie")?.match(/(?:^|;\s*)acceptance-session=([^;]+)/u)?.[1];
        if (session === "owner") {
            return { identifier: "repository-owner", role: "admin", email: "shared@example.test" };
        }
        if (session === "other-admin") {
            return { identifier: "another-administrator", role: "admin", email: "shared@example.test" };
        }
        return null;
    }
}

async function captureRequest(request: Request): Promise<CapturedRequest> {
    const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
    return {
        method: request.method,
        url: request.url,
        authorization: request.headers.get("authorization"),
        body,
    };
}

function runnerOrigin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Acceptance listener did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}

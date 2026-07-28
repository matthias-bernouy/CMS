import type { Authentication, Subject } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { DEFAULT_INTEGRATION_PACKAGE_LIMITS } from "@bernouy/cms-integration-packages";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { RepositoryCms } from "@bernouy/cms-repository";
import { REPOSITORY_CATALOG_EDITOR_DATA_SOURCE } from "@bernouy/cms-repository/catalog";
import { mountCmsRepositoryManagementGateway } from "@bernouy/cms-repository-management/gateway";
import { BunRunner } from "@bernouy/http-runner";
import {
    DEFAULT_REPOSITORY_CATALOG_READER_LIMITS,
    HttpRepositoryCatalogReader,
    HttpRepositoryCompatibilityReader,
    HttpRepositoryReleaseReader,
    HttpRepositoryVerificationBundleReader,
} from "../../../../src/repositoryCatalog";
import { HttpRepositoryManagementGateway } from "../../../../src/runtime/repository";
import { seedRepositoryHubPage } from "./hubPage";

export type CapturedRequest = Readonly<{
    method: string;
    url: string;
    authorization: string | null;
    body: string;
}>;

export type RepositoryHubSurfaces = Readonly<{
    controlOrigin: string;
    deliveryOrigin: string;
    browserRequests: CapturedRequest[];
    stop(): Promise<void>;
}>;

type SurfaceOrigins = Readonly<{
    publicRepositoryBaseUrl: string;
    managementRepositoryBaseUrl: string;
    managementRepositoryToken: string;
}>;

export async function startRepositoryHubSurfaces(origins: SurfaceOrigins): Promise<RepositoryHubSurfaces> {
    const browserRequests: CapturedRequest[] = [];
    const controlRunner = new BunRunner();
    controlRunner.use(async (request, next) => {
        browserRequests.push(await captureRequest(request));
        return await next();
    });
    const authentication = new CmsAuthentication();
    mountCmsRepositoryManagementGateway({
        runner: controlRunner,
        authentication,
        requiredRole: "admin",
        transport: new HttpRepositoryManagementGateway({
            baseUrl: origins.managementRepositoryBaseUrl,
            token: origins.managementRepositoryToken,
            timeoutMs: 10_000,
        }),
    });
    const repository = new InMemoryCmsRepository();
    await seedRepositoryHubPage(repository);
    const control = new ControlCms(controlRunner, repository, authentication, {
        editorDataSources: [REPOSITORY_CATALOG_EDITOR_DATA_SOURCE],
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
    const publicReleases = new HttpRepositoryReleaseReader({
        baseUrl: origins.publicRepositoryBaseUrl,
        timeoutMs: 10_000,
        maxResponseBytes: DEFAULT_REPOSITORY_CATALOG_READER_LIMITS.releaseEvidenceBytes,
    });
    const publicVerificationBundles = new HttpRepositoryVerificationBundleReader({
        baseUrl: origins.publicRepositoryBaseUrl,
        timeoutMs: 10_000,
        maxResponseBytes: DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes,
    });
    const repositoryCatalog = new HttpRepositoryCatalogReader({
        catalog: publicCatalog,
        baseUrl: origins.publicRepositoryBaseUrl,
    });
    deliveryRunner.group("/.cms/repository", (runner) => {
        new RepositoryCms({
            runner,
            integrationCatalog: publicCatalog,
            repositoryCatalog,
            integrationCompatibility: publicCompatibility,
            integrationProjectedReleases: publicReleases,
            integrationVerificationBundles: publicVerificationBundles,
            integrationPackages: publicPackages,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        });
    });
    new DeliveryCms({ runner: deliveryRunner, repository });
    deliveryRunner.start(0);

    return {
        controlOrigin: runnerOrigin(controlRunner),
        deliveryOrigin: runnerOrigin(deliveryRunner),
        browserRequests,
        async stop() {
            await Promise.all([controlRunner.stopGracefully(1_000), deliveryRunner.stopGracefully(1_000)]);
        },
    };
}

class CmsAuthentication implements Authentication<string> {
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
        const token = request.headers.get("authorization")?.replace(/^Bearer /u, "");
        if (token === "admin-pat") {
            return { identifier: "repository-owner", role: "admin", email: "owner@example.test" };
        }
        if (token === "other-admin-pat") {
            return { identifier: "another-administrator", role: "admin", email: "admin@example.test" };
        }
        if (token === "user-pat") {
            return { identifier: "repository-user", role: "user", email: "user@example.test" };
        }
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

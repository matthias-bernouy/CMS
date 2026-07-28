import {
    InMemoryLocalCredentialStore,
    InMemoryPatRepository,
    InMemoryUsersRepository,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
} from "@bernouy/cms-auth";
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
    adminPat: string;
    otherAdminPat: string;
    userPat: string;
    ownerSession: string;
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
    const authentication = await createAuthentication();
    mountCmsRepositoryManagementGateway({
        runner: controlRunner,
        authentication: authentication.local,
        requiredRole: "admin",
        transport: new HttpRepositoryManagementGateway({
            baseUrl: origins.managementRepositoryBaseUrl,
            token: origins.managementRepositoryToken,
            timeoutMs: 10_000,
        }),
    });
    const repository = new InMemoryCmsRepository();
    await seedRepositoryHubPage(repository);
    const control = new ControlCms(controlRunner, repository, authentication.local, {
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
        adminPat: authentication.adminPat,
        otherAdminPat: authentication.otherAdminPat,
        userPat: authentication.userPat,
        ownerSession: authentication.ownerSession,
        async stop() {
            await Promise.all([controlRunner.stopGracefully(1_000), deliveryRunner.stopGracefully(1_000)]);
        },
    };
}

type AcceptanceRole = "admin" | "user";

async function createAuthentication() {
    const users = new InMemoryUsersRepository<AcceptanceRole>();
    const resolver = new SubjectResolver<AcceptanceRole>(users, "user");
    const pats = new InMemoryPatRepository();
    const codec = new SignedCookieCodec(new TextEncoder().encode("repository-acceptance-session-secret"));
    const local = new LocalAuthentication<AcceptanceRole>({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/logout",
        credentials: new InMemoryLocalCredentialStore(),
        resolver,
        codec,
        pats,
        cookieName: "acceptance-session",
        defaultHome: "/admin/pages",
    });
    const owner = await resolver.fromIdentity({ sub: "repository-owner", provider: "local" });
    const otherAdmin = await resolver.fromIdentity({ sub: "another-administrator", provider: "local" });
    const user = await resolver.fromIdentity({ sub: "repository-user", provider: "local" });
    await users.setRole(owner.identifier, "admin");
    await users.setRole(otherAdmin.identifier, "admin");
    const [adminPat, otherAdminPat, userPat, ownerSession] = await Promise.all([
        pats.create({ sub: owner.identifier, name: "owner-cli" }).then(({ token }) => token),
        pats.create({ sub: otherAdmin.identifier, name: "other-admin-cli" }).then(({ token }) => token),
        pats.create({ sub: user.identifier, name: "user-cli" }).then(({ token }) => token),
        codec.sign({ kind: "session", sub: owner.identifier }, 3_600),
    ]);
    return { local, adminPat, otherAdminPat, userPat, ownerSession };
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

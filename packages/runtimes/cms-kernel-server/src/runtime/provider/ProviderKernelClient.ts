import type {
    Authentication,
    LocalAuthenticationActions,
    LocalLoginResult,
    PublicAuthActions,
    Subject,
} from "@bernouy/cms-auth";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { PageCapabilityAccessPort } from "@bernouy/cms-gateway/analysis";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { KernelProviderQuery, KernelProviderQueryOperation } from "@bernouy/ulvia-provider/kernel";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { ProviderKernelTransport } from "./ProviderKernelTransport";
import type { Logger } from "@bernouy/logging";
import { currentRequestHeaders } from "@bernouy/http-runner/observability";

export class ProviderKernelClient {
    readonly content: ContentReader;
    readonly authentication: Authentication;
    readonly localAuthentication: LocalAuthenticationActions;
    readonly publicAuth: PublicAuthActions;
    readonly pageCapabilities: PageCapabilityAccessPort;
    readonly collectionAssets: InstalledCollectionAssetSource;
    readonly gateway: {
        siteId: string;
        invoker: GatewayInvoker;
        isAdministrator(subject: Subject): Promise<boolean>;
    };

    constructor(
        private readonly transport: ProviderKernelTransport,
        kernelUrl: string,
        private readonly logger: Logger,
    ) {
        this.content = remoteContent(this);
        this.authentication = remoteAuthentication(this);
        this.localAuthentication = remoteLocalAuthentication(this, kernelUrl.startsWith("https:"));
        this.publicAuth = remotePublicAuth(this);
        this.pageCapabilities = {
            requiredAccess: (page) => this.query("page.capability-access", { page }),
        };
        this.gateway = {
            siteId: "default",
            invoker: {
                invoke: (invocation) => this.query("gateway.invoke", { invocation }),
                resolveHttp: (request) => this.query("gateway.resolve-http", { request }),
            },
            isAdministrator: (subject) => this.query("auth.is-administrator", { subjectId: subject.identifier }),
        };
        this.collectionAssets = {
            siteId: "default",
            store: {
                getInstalledAssetMetadata: (_siteId, collectionId, assetId) =>
                    this.query("assets.metadata", { collectionId, assetId }),
                getInstalledAssetMetadataBatch: (_siteId, references) =>
                    this.query("assets.metadata-batch", { references }),
                getReleaseAsset: async () => {
                    throw new Error("Collection asset bytes are streamed through the Provider proxy");
                },
            },
        };
    }

    async query<T>(operation: KernelProviderQueryOperation, input?: unknown): Promise<T> {
        const startedAt = performance.now();
        try {
            const headers = currentRequestHeaders({ "content-type": "application/json" });
            const response = await this.transport.request("/ulvia/kernel/v1/query", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    operation,
                    ...(input === undefined ? {} : { input }),
                } satisfies KernelProviderQuery),
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) {
                this.logger.warn("provider.query.rejected", {
                    operation,
                    status: response.status,
                    durationMs: roundedDuration(performance.now() - startedAt),
                });
                throw new ProviderQueryError(response.status);
            }
            return ((await response.json()) as { value: T }).value;
        } catch (error) {
            if (!(error instanceof ProviderQueryError)) {
                this.logger.error(
                    "provider.query.failed",
                    { operation, durationMs: roundedDuration(performance.now() - startedAt) },
                    error,
                );
            }
            throw error;
        }
    }

    auth(action: string, request: Request): Promise<Response> {
        return this.forward(`/ulvia/kernel/v1/auth/${action}`, request, undefined, 10_000);
    }

    capability = (request: Request): Promise<Response> =>
        this.forward(
            `/ulvia/kernel/v1/call${new URL(request.url).pathname.slice("/.cms/call".length)}${new URL(request.url).search}`,
            request,
        );

    declarativeQuery = (request: Request): Promise<Response> =>
        this.forward(`/ulvia/kernel/v1/queries${new URL(request.url).pathname.slice("/.cms/query".length)}`, request);

    collectionAsset = (request: Request): Promise<Response> =>
        this.forward(
            `/ulvia/kernel/v1/collections${new URL(request.url).pathname.slice("/.cms/collections".length)}${new URL(request.url).search}`,
            request,
        );

    sitemap = (request: Request): Promise<Response> => this.forwardSitemap(request);

    private async forward(
        path: string,
        request: Request,
        extraHeaders?: HeadersInit,
        timeoutMs?: number,
    ): Promise<Response> {
        const response = await this.transport.forward(path, request, currentRequestHeaders(extraHeaders), timeoutMs);
        if (!response.ok) {
            this.logger.warn("provider.proxy.failed", {
                path: path.split("?")[0],
                status: response.status,
            });
        }
        return this.transport.response(response);
    }

    private forwardSitemap(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        return this.forward("/ulvia/kernel/v1/sitemap/resource", request, { "x-ulvia-original-path": path });
    }
}

class ProviderQueryError extends Error {
    constructor(status: number) {
        super(`Provider query failed (${status})`);
        this.name = "ProviderQueryError";
    }
}

function roundedDuration(durationMs: number): number {
    return Math.round(durationMs * 100) / 100;
}

function remoteContent(client: ProviderKernelClient): ContentReader {
    return {
        getContentTexts: async () => {
            const projection = await client.query<{
                defaultLocale: string;
                sources: { namespace: string; catalogues: Record<string, Record<string, string>> }[];
            }>("content.texts");
            return projection.sources.map((source) => ({
                namespace: source.namespace,
                resolve: (locale) => source.catalogues[locale] ?? source.catalogues[projection.defaultLocale] ?? {},
            }));
        },
        getContentRevision: () => client.query("content.revision"),
        getRenderablePage: (path) => client.query("content.renderable-page", { path }),
        getRenderablePages: () => client.query("content.renderable-pages"),
        resolvePageReference: (reference) => client.query("content.resolve-page-reference", { reference }),
        resolvePagePaths: (paths) => client.query("content.resolve-page-paths", { paths }),
        resolveRenderableRoute: (path) => client.query("content.resolve-renderable-route", { path }),
        getPublishedPage: (path) => client.query("content.published-page", { path }),
        getPublishedPageById: (id) => client.query("content.published-page-by-id", { id }),
        getPublishedPages: () => client.query("content.published-pages"),
        resolvePublishedRoute: (path) => client.query("content.resolve-published-route", { path }),
        getRenderableBlocs: () => client.query("content.renderable-blocs"),
        getBlocViewJS: (tag) => client.query("content.bloc-view-js", { tag }),
        getRenderingSettings: () => client.query("content.rendering-settings"),
    };
}

function remoteAuthentication(client: ProviderKernelClient): Authentication {
    return {
        loginUrl: "/login",
        logoutUrl: "/auth/logout",
        profileUrl: "",
        buildLoginUrl: (returnTo) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        buildLogoutUrl: (returnTo) => `/auth/logout?returnTo=${encodeURIComponent(returnTo)}`,
        getSubject: (request) =>
            client.query("auth.subject", {
                cookie: request.headers.get("cookie") ?? undefined,
                authorization: request.headers.get("authorization") ?? undefined,
            }),
    };
}

function remoteLocalAuthentication(client: ProviderKernelClient, secure: boolean): LocalAuthenticationActions {
    return {
        loginUrl: "/login",
        defaultHome: "/admin",
        async authenticate(email, password): Promise<LocalLoginResult> {
            const response = await client.auth(
                "login",
                new Request("http://kernel.internal/", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email, password }),
                }),
            );
            const value = (await response.json()) as { subject?: Subject; cookie?: string };
            if (!response.ok || !value.subject) {
                return { ok: false, error: response.status === 429 ? "rate_limited" : "invalid_credentials" };
            }
            if (!value.cookie) {
                return { ok: false, error: "invalid_credentials" };
            }
            return { ok: true, subject: value.subject, cookie: value.cookie };
        },
        clearSession: () => `cms-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`,
    };
}

function remotePublicAuth(client: ProviderKernelClient): PublicAuthActions {
    const post = async (action: string, input: unknown): Promise<void> => {
        const response = await client.auth(
            action,
            new Request("http://kernel.internal/", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(input),
            }),
        );
        if (!response.ok) {
            throw new Error(`Provider authentication failed (${response.status})`);
        }
    };
    return {
        buildLoginUrl: (returnTo) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        login: async (request) => {
            const response = await client.auth("login", request);
            const value = (await response.json()) as { subject?: Subject; cookie?: string; error?: string };
            return Response.json(
                value.subject ? { subject: value.subject } : { error: value.error ?? "invalid_credentials" },
                {
                    status: value.subject ? 200 : response.status,
                    headers: value.cookie ? { "set-cookie": value.cookie } : {},
                },
            );
        },
        logout: () =>
            new Response(JSON.stringify({ ok: true }), {
                headers: {
                    "content-type": "application/json",
                    "set-cookie": "cms-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
                },
            }),
        subject: (request) => client.authentication.getSubject(request),
        signup: (input) => post("signup", input),
        requestEmailVerification: async (input) => {
            await post("request-email-verification", input);
            return { sent: true };
        },
        confirmEmailVerification: (input) => post("confirm-email-verification", input),
        requestPasswordReset: async (input) => {
            await post("request-password-reset", input);
            return { sent: true };
        },
        confirmPasswordReset: (input) => post("confirm-password-reset", input),
    };
}

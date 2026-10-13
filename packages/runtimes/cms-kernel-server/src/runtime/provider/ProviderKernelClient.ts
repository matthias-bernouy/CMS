import type {
    Authentication,
    IdentityProvider,
    IdentityProviderRepository,
    LocalAuthenticationActions,
    LocalLoginResult,
    PublicAuthActions,
    Subject,
} from "@bernouy/cms-auth";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { PageExecutionHttpPort } from "@bernouy/cms-gateway/http/handlers";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { KernelProviderQuery, KernelProviderQueryOperation } from "@bernouy/ulvia-provider/kernel";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";

export class ProviderKernelClient {
    readonly content: ContentReader;
    readonly authentication: Authentication;
    readonly localAuthentication: LocalAuthenticationActions;
    readonly publicAuth: PublicAuthActions;
    readonly identityProviders: IdentityProviderRepository;
    readonly pageExecution: PageExecutionHttpPort;
    readonly collectionAssets: InstalledCollectionAssetSource;
    readonly gateway: {
        siteId: string;
        invoker: GatewayInvoker;
        isAdministrator(subject: Subject): Promise<boolean>;
    };

    constructor(
        private readonly endpoint: string,
        private readonly token: string,
        kernelUrl: string,
    ) {
        this.content = remoteContent(this);
        this.authentication = remoteAuthentication(this);
        this.localAuthentication = remoteLocalAuthentication(this, kernelUrl.startsWith("https:"));
        this.publicAuth = remotePublicAuth(this);
        this.identityProviders = remoteIdentityProviders(this);
        this.pageExecution = {
            requiredAccess: (page, pageUrl) =>
                this.query("page.required-access", { path: page.page.path, url: pageUrl.toString() }),
            authorizeCall: async () => {
                throw new Error("Capability authorization is owned by the Provider");
            },
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
        const response = await fetch(`${this.endpoint}/ulvia/kernel/v1/query`, {
            method: "POST",
            headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
            body: JSON.stringify({
                operation,
                ...(input === undefined ? {} : { input }),
            } satisfies KernelProviderQuery),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            throw new Error(`Provider query failed (${response.status})`);
        }
        return ((await response.json()) as { value: T }).value;
    }

    auth(action: string, request: Request): Promise<Response> {
        return this.forward(`/ulvia/kernel/v1/auth/${action}`, request);
    }

    capability = (request: Request): Promise<Response> =>
        this.forward(
            `/ulvia/kernel/v1/call${new URL(request.url).pathname.slice("/.cms/call".length)}${new URL(request.url).search}`,
            request,
        );

    collectionAsset = (request: Request): Promise<Response> =>
        this.forward(
            `/ulvia/kernel/v1/collections${new URL(request.url).pathname.slice("/.cms/collections".length)}${new URL(request.url).search}`,
            request,
        );

    sitemap = (request: Request): Promise<Response> => this.forwardSitemap(request);

    private async forward(path: string, request: Request, extraHeaders?: HeadersInit): Promise<Response> {
        const headers = new Headers(request.headers);
        const actorAuthorization = headers.get("authorization");
        headers.delete("x-ulvia-actor-authorization");
        headers.set("authorization", `Bearer ${this.token}`);
        if (actorAuthorization) {
            headers.set("x-ulvia-actor-authorization", actorAuthorization);
        }
        for (const [name, value] of new Headers(extraHeaders)) {
            headers.set(name, value);
        }
        const response = await fetch(`${this.endpoint}${path}`, {
            method: request.method,
            headers,
            body: request.body,
            redirect: "manual",
            signal: AbortSignal.timeout(30_000),
            ...(request.body ? { duplex: "half" } : {}),
        });
        if (!response.ok) {
            const errorCode = await response
                .clone()
                .json()
                .then((value) => (value as { error?: { code?: string } }).error?.code)
                .catch(() => undefined);
            console.error("Provider proxy request failed", {
                path: path.split("?")[0],
                status: response.status,
                errorCode,
            });
        }
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    }

    private forwardSitemap(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        return this.forward("/ulvia/kernel/v1/sitemap/resource", request, { "x-ulvia-original-path": path });
    }
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

function remoteIdentityProviders(client: ProviderKernelClient): IdentityProviderRepository {
    const list = () => client.query<IdentityProvider[]>("auth.identity-providers");
    return {
        list,
        get: async (id) => (await list()).find((provider) => provider.id === id) ?? null,
        create: async () => unsupported(),
        update: async () => unsupported(),
        delete: async () => unsupported(),
    };
}

function unsupported(): never {
    throw new Error("Identity provider mutations are owned by the Provider");
}

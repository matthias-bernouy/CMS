import type { Subject } from "@bernouy/cms-auth";
import { localLoginHandler, localLogoutHandler } from "@bernouy/cms-auth/http";
import { createContentReader, type ContentReader } from "@bernouy/cms-content/rendering";
import { PageExecutionService } from "@bernouy/cms-gateway/execution";
import { createCapabilityHttpHandler, createCapabilityQueryHandler } from "@bernouy/cms-gateway/http/handlers";
import { serveInstalledCollectionAsset } from "@bernouy/cms-repository/collections/http";
import { createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-seo/http";
import type { KernelInstanceApi, KernelProviderQuery } from "@bernouy/ulvia-provider/kernel";
import type { InstanceComposition } from "../instances/ProviderInstanceHost";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import { createInstanceAuth } from "../authentication/createInstanceAuth";
import type { Logger } from "@bernouy/logging";

export async function createInstanceKernelApi(
    instance: ProviderInstanceRecord,
    composition: Pick<InstanceComposition, "stores" | "gateway">,
    logger: Logger,
): Promise<KernelInstanceApi> {
    const { stores, gateway } = composition;
    const content = createContentReader(stores.repo, {
        resolvePageRoute: (path) => stores.pageRoutes.resolve(gateway.siteId, path),
    });
    let authentication: Awaited<ReturnType<typeof createInstanceAuth>> | undefined;
    const getAuthentication = async () => (authentication ??= await createInstanceAuth(stores, instance.kernelUrl));
    const pageExecution = new PageExecutionService({
        siteId: gateway.siteId,
        content,
        authority: gateway.pageExecutions,
        resolveCapability: gateway.resolvePageCapability,
    });
    const capability = createCapabilityHttpHandler({
        siteId: gateway.siteId,
        basePath: "",
        invoker: gateway.invoker,
        pageExecution,
        authenticateProvider: gateway.authenticateProvider,
        resolveActor: async (request) =>
            resolveActor(request, (await getAuthentication()).auth, gateway.isAdministrator),
    });
    const query = createCapabilityQueryHandler({
        siteId: gateway.siteId,
        basePath: "",
        invoker: gateway.invoker,
        pageExecution,
        resolveCapability: gateway.resolvePageCapability,
        resolveActor: async (request) =>
            resolveActor(request, (await getAuthentication()).auth, gateway.isAdministrator),
    });
    const sitemap = createSitemapHandler({
        content,
        store: stores.sitemapStore,
        isReservedPath,
        logger,
    });
    const sitemapChunk = createSitemapChunkHandler({ store: stores.sitemapStore, basePath: "", logger });
    return {
        query: (query) => executeLoggedQuery(query, content, getAuthentication, stores, gateway, pageExecution, logger),
        handleAuth: async (action, request) => handleAuth(action, request, await getAuthentication()),
        handleCapability: (request) => capability(rewritePath(request, "/ulvia/kernel/v1/call", "/.cms/call")),
        handleQuery: (request) => query(rewritePath(request, "/ulvia/kernel/v1/queries", "/.cms/query")),
        handleCollectionAsset: (request) =>
            serveInstalledCollectionAsset(
                rewritePath(request, "/ulvia/kernel/v1/collections", "/.cms/collections"),
                { siteId: gateway.siteId, store: stores.collections },
                "",
            ),
        handleSitemap: (request) => {
            const original = request.headers.get("x-ulvia-original-path") ?? "/sitemap.xml";
            const rewritten = rewriteAbsolutePath(request, original);
            return original === "/sitemap.xml" ? sitemap(rewritten) : sitemapChunk(rewritten);
        },
    };
}

async function executeLoggedQuery(
    query: KernelProviderQuery,
    content: ContentReader,
    getAuthentication: () => Promise<Awaited<ReturnType<typeof createInstanceAuth>>>,
    stores: InstanceComposition["stores"],
    gateway: InstanceComposition["gateway"],
    pageExecution: PageExecutionService,
    logger: Logger,
): Promise<unknown> {
    const startedAt = performance.now();
    try {
        const value = await executeQuery(query, content, getAuthentication, stores, gateway, pageExecution);
        logger.debug("provider.kernel.query.completed", {
            operation: query.operation,
            durationMs: roundedDuration(performance.now() - startedAt),
        });
        return value;
    } catch (error) {
        logger.error(
            "provider.kernel.query.failed",
            { operation: query.operation, durationMs: roundedDuration(performance.now() - startedAt) },
            error,
        );
        throw error;
    }
}

async function executeQuery(
    query: KernelProviderQuery,
    content: ContentReader,
    getAuthentication: () => Promise<Awaited<ReturnType<typeof createInstanceAuth>>>,
    stores: InstanceComposition["stores"],
    gateway: InstanceComposition["gateway"],
    pageExecution: PageExecutionService,
): Promise<unknown> {
    const input = objectInput(query.input);
    switch (query.operation) {
        case "content.texts":
            return projectContentTexts(content);
        case "content.revision":
            return (await content.getContentRevision?.()) ?? 0;
        case "content.renderable-page":
            return content.getRenderablePage(text(input.path));
        case "content.renderable-pages":
            return content.getRenderablePages();
        case "content.resolve-page-reference":
            return content.resolvePageReference(input.reference as never);
        case "content.resolve-page-paths":
            return content.resolvePagePaths(textArray(input.paths));
        case "content.resolve-renderable-route":
            return content.resolveRenderableRoute(text(input.path));
        case "content.published-page":
            return content.getPublishedPage(text(input.path));
        case "content.published-page-by-id":
            return content.getPublishedPageById(text(input.id));
        case "content.published-pages":
            return content.getPublishedPages();
        case "content.resolve-published-route":
            return content.resolvePublishedRoute(text(input.path));
        case "content.renderable-blocs":
            return content.getRenderableBlocs();
        case "content.bloc-view-js":
            return content.getBlocViewJS(text(input.tag));
        case "content.rendering-settings":
            return content.getRenderingSettings();
        case "auth.subject":
            return (await getAuthentication()).auth.getSubject(requestFromInput(input));
        case "auth.is-administrator":
            return gateway.isAdministrator({ identifier: text(input.subjectId) });
        case "auth.identity-providers":
            return stores.identityProviders.list();
        case "page.required-access": {
            const path = text(input.path);
            const page = await content.getRenderablePage(path);
            return page ? pageExecution.requiredAccess(page, new URL(text(input.url)), "/.cms/call") : null;
        }
        case "gateway.invoke":
            return gateway.invoker.invoke(input.invocation as never);
        case "gateway.resolve-http":
            return gateway.invoker.resolveHttp(input.request as never);
        case "assets.metadata":
            return stores.collections.getInstalledAssetMetadata(
                gateway.siteId,
                text(input.collectionId),
                text(input.assetId),
            );
        case "assets.metadata-batch":
            return stores.collections.getInstalledAssetMetadataBatch(gateway.siteId, input.references as never);
    }
}

async function projectContentTexts(content: ContentReader) {
    const settings = await content.getRenderingSettings();
    const defaultLocale = settings.site.language || "en";
    const locales = [...new Set([defaultLocale, ...(settings.site.activeLanguages ?? [])])];
    const sources = (await content.getContentTexts?.()) ?? [];
    return {
        defaultLocale,
        sources: sources.map((source) => ({
            namespace: source.namespace,
            catalogues: Object.fromEntries(locales.map((locale) => [locale, source.resolve(locale)])),
        })),
    };
}

async function handleAuth(
    action: string,
    request: Request,
    authentication: Awaited<ReturnType<typeof createInstanceAuth>>,
): Promise<Response> {
    if (action === "login") {
        if (!request.headers.get("content-type")?.includes("application/json")) {
            return localLoginHandler(authentication.auth, request);
        }
        const input = objectInput(await request.json());
        return Response.json(await authentication.auth.authenticate(text(input.email), text(input.password)), {
            headers: { "cache-control": "private, no-store" },
        });
    }
    if (action === "logout") {
        return localLogoutHandler(authentication.auth, request);
    }
    const input = objectInput(await request.json());
    if (action === "signup") {
        await authentication.publicAuth.signup({ email: text(input.email), password: text(input.password) });
    } else if (action === "request-email-verification") {
        await authentication.publicAuth.requestEmailVerification({ email: text(input.email) });
    } else if (action === "confirm-email-verification") {
        await authentication.publicAuth.confirmEmailVerification({ token: text(input.token) });
    } else if (action === "request-password-reset") {
        await authentication.publicAuth.requestPasswordReset({ email: text(input.email) });
    } else if (action === "confirm-password-reset") {
        await authentication.publicAuth.confirmPasswordReset({
            token: text(input.token),
            password: text(input.password),
        });
    } else {
        return new Response(null, { status: 404 });
    }
    return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

async function resolveActor(
    request: Request,
    authentication: Awaited<ReturnType<typeof createInstanceAuth>>["auth"],
    isAdministrator: (subject: Subject) => Promise<boolean>,
) {
    const subject = await authentication.getSubject(request).catch(() => null);
    if (!subject) {
        return { kind: "anonymous" as const };
    }
    return (await isAdministrator(subject))
        ? { kind: "administrator" as const, subjectId: subject.identifier }
        : { kind: "user" as const, subjectId: subject.identifier };
}

function requestFromInput(input: Record<string, unknown>): Request {
    const headers = new Headers();
    if (typeof input.cookie === "string") {
        headers.set("cookie", input.cookie);
    }
    if (typeof input.authorization === "string") {
        headers.set("authorization", input.authorization);
    }
    return new Request("http://kernel.internal/", { headers });
}

function rewritePath(request: Request, from: string, to: string): Request {
    const url = new URL(request.url);
    url.pathname = `${to}${url.pathname.slice(from.length)}`;
    return new Request(url, request);
}

function rewriteAbsolutePath(request: Request, path: string): Request {
    const url = new URL(request.url);
    url.pathname = path;
    return new Request(url, request);
}

function objectInput(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function text(value: unknown): string {
    if (typeof value !== "string" || value.length > 8_192) {
        throw new TypeError("Kernel query input is invalid");
    }
    return value;
}

function textArray(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 256) {
        throw new TypeError("Kernel query input is invalid");
    }
    return value.map(text);
}

function isReservedPath(path: string): boolean {
    return path === "/.cms" || path.startsWith("/.cms/");
}

function roundedDuration(durationMs: number): number {
    return Math.round(durationMs * 100) / 100;
}

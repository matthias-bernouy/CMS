import { createContentReader, type ContentReader } from "@bernouy/cms-content/rendering";
import { PageCapabilityAnalyzer, type PageCapabilityDocument } from "@bernouy/cms-gateway/analysis";
import { createCapabilityHttpHandler, createCapabilityQueryHandler } from "@bernouy/cms-gateway/http/handlers";
import { serveInstalledCollectionAsset } from "@bernouy/cms-repository/collections/http";
import { createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-seo/http";
import type { KernelInstanceApi, KernelProviderQuery } from "@bernouy/ulvia-provider/kernel";
import type { InstanceComposition } from "../instances/ProviderInstanceHost";
import type { Logger } from "@bernouy/logging";
import type { GatewayActor } from "@bernouy/cms-gateway";
import { actorCredentialFromRequest } from "@bernouy/cms-gateway/protocol";

export async function createInstanceKernelApi(
    composition: Pick<InstanceComposition, "stores" | "gateway">,
    logger: Logger,
): Promise<KernelInstanceApi> {
    const { stores, gateway } = composition;
    const content = createContentReader(stores.repo, {
        resolvePageRoute: (path) => stores.pageRoutes.resolve(gateway.siteId, path),
    });
    const pageCapabilities = new PageCapabilityAnalyzer({
        resolveCapability: gateway.resolvePageCapability,
    });
    const capability = createCapabilityHttpHandler({
        siteId: gateway.siteId,
        basePath: "",
        invoker: gateway.invoker,
        authenticateProvider: gateway.authenticateProvider,
        onFailure: (failure, error) => {
            const attributes = {
                phase: failure.phase,
                code: failure.code,
                status: failure.status,
            };
            if (failure.status >= 500) {
                logger.error("provider.kernel.capability.failed", attributes, error);
            } else {
                logger.warn("provider.kernel.capability.rejected", attributes, error);
            }
        },
        resolveActor: (request) => resolveActor(request, gateway.siteId, gateway.invoker),
    });
    const query = createCapabilityQueryHandler({
        siteId: gateway.siteId,
        basePath: "",
        invoker: gateway.invoker,
        resolveCapability: gateway.resolvePageCapability,
        resolveActor: (request) => resolveActor(request, gateway.siteId, gateway.invoker),
    });
    const sitemap = createSitemapHandler({
        content,
        store: stores.sitemapStore,
        isReservedPath,
        logger,
    });
    const sitemapChunk = createSitemapChunkHandler({ store: stores.sitemapStore, basePath: "", logger });
    return {
        query: (query) => executeLoggedQuery(query, content, stores, gateway, pageCapabilities, logger),
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
    stores: InstanceComposition["stores"],
    gateway: InstanceComposition["gateway"],
    pageCapabilities: PageCapabilityAnalyzer,
    logger: Logger,
): Promise<unknown> {
    const startedAt = performance.now();
    try {
        const value = await executeQuery(query, content, stores, gateway, pageCapabilities);
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
    stores: InstanceComposition["stores"],
    gateway: InstanceComposition["gateway"],
    pageCapabilities: PageCapabilityAnalyzer,
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
        case "page.capability-access": {
            return pageCapabilities.requiredAccess(input.page as PageCapabilityDocument);
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

async function resolveActor(
    request: Request,
    siteId: string,
    invoker: InstanceComposition["gateway"]["invoker"],
): Promise<GatewayActor> {
    const actorCredential = actorCredentialFromRequest(request);
    const result = await invoker.invoke({
        siteId,
        contractId: "ulvia.cms.access",
        capabilityId: "resolve-actor",
        input: {},
        actor: { kind: "anonymous" },
        ...(actorCredential ? { actorCredential } : {}),
    });
    if (result.kind !== "success" || !result.output || typeof result.output !== "object") {
        throw new TypeError("Access actor resolver returned an invalid outcome");
    }
    const output = result.output as Record<string, unknown>;
    if (output.state === "anonymous") {
        return { kind: "anonymous" as const };
    }
    if (
        output.state !== "authenticated" ||
        typeof output.subjectId !== "string" ||
        typeof output.administrator !== "boolean"
    ) {
        throw new TypeError("Access actor resolver returned an invalid actor");
    }
    return {
        kind: output.administrator ? "administrator" : "user",
        subjectId: output.subjectId,
    };
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

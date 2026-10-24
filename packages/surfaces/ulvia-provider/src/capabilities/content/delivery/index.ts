import { createContentReader, type ContentReader, type RenderablePage } from "@bernouy/cms-content/rendering";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";
import { blocViews, pageRenderRevision, projectPageRenderInputs } from "./renderInputs";
import { registerContentResourceCapabilities } from "./resources";

const CHUNK_LENGTH = 1024 * 1024;
const MAX_CHUNKS = 7;
const MAX_RESPONSE_BYTES = 7 * 1024 * 1024;

export function registerContentDeliveryCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    const content = createContentReader(dependencies.repo, {
        ...(dependencies.resolvePageRoute ? { resolvePageRoute: dependencies.resolvePageRoute } : {}),
    });
    dispatcher.register("ulvia.cms.content", "delivery.read", async (request) => {
        const operation = requiredText(request.operation);
        const input = parseInput(request.inputJson);
        const value = await executeDeliveryRead(operation, input, content, dependencies);
        return encodeDeliveryValue(value);
    });
    registerContentResourceCapabilities(dispatcher, dependencies, content);
}

async function executeDeliveryRead(
    operation: string,
    input: Readonly<Record<string, unknown>>,
    content: ContentReader,
    dependencies: CmsContentDependencies,
): Promise<unknown> {
    switch (operation) {
        case "content.texts":
            return projectContentTexts(content);
        case "content.revision":
            return (await content.getContentRevision?.()) ?? 0;
        case "content.rendering-revision":
            return (await content.getRenderingRevision?.()) ?? (await content.getContentRevision?.()) ?? 0;
        case "content.editorial-route":
            return resolveEditorialRoute(requiredText(input.path), dependencies.repo);
        case "content.renderable-page":
            return content.getRenderablePage(requiredText(input.path));
        case "content.renderable-pages":
            return content.getRenderablePages();
        case "content.resolve-page-reference":
            return content.resolvePageReference(input.reference as never);
        case "content.resolve-page-paths":
            return content.resolvePagePaths(requiredTextArray(input.paths));
        case "content.resolve-renderable-route":
            return content.resolveRenderableRoute(requiredText(input.path));
        case "content.published-page":
            return content.getPublishedPage(requiredText(input.path));
        case "content.published-page-by-id":
            return content.getPublishedPageById(requiredText(input.id));
        case "content.published-pages":
            return content.getPublishedPages();
        case "content.resolve-published-route":
            return content.resolvePublishedRoute(requiredText(input.path));
        case "content.renderable-blocs":
            return content.getRenderableBlocs();
        case "content.bloc-view-js":
            return content.getBlocViewJS(requiredText(input.tag));
        case "content.rendering-settings":
            return content.getRenderingSettings();
        case "content.page-render-inputs":
            return projectPageRenderInputs(requiredText(input.path), content);
        case "content.page-render-revision":
            return pageRenderRevision(requiredText(input.path), content);
        case "content.bloc-views":
            return blocViews(requiredTextArray(input.tags), content);
        case "assets.metadata":
            return dependencies.collections.getInstalledAssetMetadata(
                "default",
                requiredText(input.collectionId),
                requiredText(input.assetId),
            );
        case "assets.metadata-batch":
            return dependencies.collections.getInstalledAssetMetadataBatch("default", input.references as never);
        default:
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

async function resolveEditorialRoute(
    path: string,
    repo: CmsContentDependencies["repo"],
): Promise<{ page: RenderablePage; language: string } | null> {
    const route = await repo.getPageRoute(path);
    if (route?.state !== "current") {
        return null;
    }
    const page = await repo.getPageById(route.pageId);
    if (!page) {
        return null;
    }
    const finalRoute = await repo.getPageRoute(path);
    if (
        finalRoute?.state !== "current" ||
        finalRoute.pageId !== route.pageId ||
        finalRoute.language !== route.language
    ) {
        return null;
    }
    return {
        page: {
            reference: { kind: "site", pageId: page.id },
            page: structuredClone({ ...page, path }),
            source: { kind: "site", pageId: page.id, revision: page.revision },
            requirements: [...((await repo.getPageRequirements?.(page)) ?? [])],
        },
        language: route.language,
    };
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

function encodeDeliveryValue(value: unknown): { chunks: string[] } {
    const json = JSON.stringify(value);
    if (json === undefined) {
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    const chunks: string[] = [];
    for (let offset = 0; offset < json.length; offset += CHUNK_LENGTH) {
        chunks.push(json.slice(offset, offset + CHUNK_LENGTH));
    }
    const output = { chunks };
    if (
        chunks.length > MAX_CHUNKS ||
        new TextEncoder().encode(JSON.stringify(output)).byteLength > MAX_RESPONSE_BYTES
    ) {
        throw new ProviderCapabilityDispatchError("RESPONSE_TOO_LARGE", 413);
    }
    return output;
}

function parseInput(value: unknown): Readonly<Record<string, unknown>> {
    if (value === undefined) {
        return {};
    }
    if (typeof value !== "string") {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    try {
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new TypeError("Delivery input must be an object");
        }
        return parsed as Readonly<Record<string, unknown>>;
    } catch {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 8192) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function requiredTextArray(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 256) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map(requiredText);
}

import type { PageDocument } from "cms-content/pages/interfaces/document";
import type { ContentReader, RenderableBloc } from "cms-content/application/interfaces/ContentReader";
import { expandCompositions } from "cms-content/blocs/core/composition/expandCompositions";
import { wrapBindingCore } from "cms-content/blocs/core/markup/bindingRoot";
import { CMS_BINDING_ATTRIBUTES } from "cms-content/blocs/core/markup/bindings";
import { sanitizeDomTree } from "cms-content/blocs/core/markup/security/sanitizeDomTree";
import { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";
import { renderContentTexts, type ContentTextSource } from "cms-content/pages/core/rendering/contentTexts";
import { expandSvgReferences } from "cms-content/pages/core/rendering/expandSvgReferences";

export interface PageDocumentRenderContext {
    readonly repository: Pick<ContentReader, "getBlocViewJS" | "getContentTexts" | "getRenderableBlocs">;
    readonly language: string;
    readonly contentTexts?: readonly ContentTextSource[];
    readonly resolveContributedAssets?: (input: string) => Promise<string>;
    readonly resolveSvgSources?: (sources: readonly string[]) => Promise<ReadonlyMap<string, string | Uint8Array>>;
    readonly prepareBody?: (body: Element) => void | Promise<void>;
}

export interface RenderedPageDocument {
    readonly html: string;
    /** Every Bloc referenced by the authored Page, including expanded compositions. */
    readonly referencedTags: readonly string[];
    /** Blocs still represented in rendered markup and therefore requiring browser assets. */
    readonly usedTags: readonly string[];
    readonly renderableBlocs: readonly RenderableBloc[];
    readonly requiresBindingRuntime: boolean;
}

/** Shared, surface-neutral Page composition and hardening pipeline. */
export async function renderPageDocument(
    body: Element,
    page: PageDocument,
    context: PageDocumentRenderContext,
): Promise<RenderedPageDocument> {
    body.innerHTML = wrapBindingCore(page.html);
    sanitizeDomTree(body);

    const blocList = await context.repository.getRenderableBlocs();
    const resolveBlocUsage = createBlocUsageResolver(blocList, context.repository);
    const referencedTags = await resolveBlocUsage(body.innerHTML);
    expandCompositions(body, blocList);
    renderContentTexts(
        body,
        context.language,
        context.repository.getContentTexts ? await context.repository.getContentTexts() : (context.contentTexts ?? []),
    );
    if (context.resolveSvgSources) {
        await expandSvgReferences(body, context.resolveSvgSources);
    }
    if (context.resolveContributedAssets) {
        body.innerHTML = await context.resolveContributedAssets(body.innerHTML);
    }
    sanitizeDomTree(body);
    await context.prepareBody?.(body);

    const html = body.innerHTML;
    const resolvedTags = await resolveBlocUsage(html);
    return {
        html,
        referencedTags,
        usedTags: resolvedTags,
        renderableBlocs: blocList,
        requiresBindingRuntime: hasLiveBindings(body),
    };
}

const BINDING_SELECTOR = Object.values(CMS_BINDING_ATTRIBUTES)
    .map((attribute) => `[${attribute}]`)
    .join(",");

function hasLiveBindings(body: Element): boolean {
    return body.querySelector(BINDING_SELECTOR) !== null || body.innerHTML.includes("{{");
}

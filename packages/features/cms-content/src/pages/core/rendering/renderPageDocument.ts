import type { PageDocument } from "cms-content/pages/interfaces/document";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { expandCompositions } from "cms-content/blocs/core/composition/expandCompositions";
import { wrapBindingCore } from "cms-content/blocs/core/markup/bindingRoot";
import { CMS_BINDING_CORE_TAG } from "cms-content/blocs/core/markup/bindings";
import { sanitizeDomTree } from "cms-content/blocs/core/markup/security/sanitizeDomTree";
import { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";
import { renderContentTexts, type ContentTextSource } from "cms-content/pages/core/rendering/contentTexts";

export interface PageDocumentRenderContext {
    readonly repository: Pick<ContentReader, "getBlocViewJS" | "getContentTexts" | "getRenderableBlocs">;
    readonly language: string;
    readonly contentTexts?: readonly ContentTextSource[];
    readonly resolveContributedAssets?: (input: string) => Promise<string>;
    readonly prepareBody?: (body: Element) => void | Promise<void>;
}

export interface RenderedPageDocument {
    readonly html: string;
    readonly usedTags: readonly string[];
    readonly hasBindingCore: boolean;
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
    expandCompositions(body, blocList);
    renderContentTexts(
        body,
        context.language,
        context.repository.getContentTexts ? await context.repository.getContentTexts() : (context.contentTexts ?? []),
    );
    if (context.resolveContributedAssets) {
        body.innerHTML = await context.resolveContributedAssets(body.innerHTML);
    }
    sanitizeDomTree(body);
    await context.prepareBody?.(body);

    const html = body.innerHTML;
    const resolvedTags = await createBlocUsageResolver(blocList, context.repository)(html);
    const viewEntries = await Promise.all(
        resolvedTags.map(async (tag) => ({ tag, viewJS: await context.repository.getBlocViewJS(tag) })),
    );
    return {
        html,
        usedTags: viewEntries.filter((entry) => !!entry.viewJS).map((entry) => entry.tag),
        hasBindingCore: body.querySelector(CMS_BINDING_CORE_TAG) !== null,
    };
}

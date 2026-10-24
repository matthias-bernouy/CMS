import type { ContentReader, PageRenderInputs } from "@bernouy/cms-content/rendering";

export async function pageRenderRevision(path: string, content: ContentReader): Promise<number | string> {
    if (content.getPageRenderRevision) {
        return content.getPageRenderRevision(path);
    }
    return (await fallbackPageRenderInputs(path, content)).artifactRevision;
}

export async function projectPageRenderInputs(path: string, content: ContentReader) {
    const inputs = content.getPageRenderInputs
        ? await content.getPageRenderInputs(path)
        : await fallbackPageRenderInputs(path, content);
    const defaultLocale = inputs.settings.site.language || "en";
    const locales = [...new Set([defaultLocale, ...(inputs.settings.site.activeLanguages ?? [])])];
    return {
        route: inputs.route,
        artifactRevision: inputs.artifactRevision,
        renderingRevision: inputs.renderingRevision,
        settings: inputs.settings,
        renderableBlocs: inputs.renderableBlocs,
        texts: {
            defaultLocale,
            sources: inputs.contentTexts.map((source) => ({
                namespace: source.namespace,
                catalogues: Object.fromEntries(locales.map((locale) => [locale, source.resolve(locale)])),
            })),
        },
    };
}

export async function blocViews(
    tags: readonly string[],
    content: ContentReader,
): Promise<Record<string, string | null>> {
    const uniqueTags = [...new Set(tags)];
    if (content.getBlocViewsJS) {
        return { ...(await content.getBlocViewsJS(uniqueTags)) };
    }
    return Object.fromEntries(
        await Promise.all(uniqueTags.map(async (tag) => [tag, await content.getBlocViewJS(tag)])),
    );
}

async function fallbackPageRenderInputs(path: string, content: ContentReader): Promise<PageRenderInputs> {
    const [route, renderingRevision, settings, contentTexts, renderableBlocs] = await Promise.all([
        content.resolveRenderableRoute(path),
        content.getRenderingRevision?.() ?? content.getContentRevision?.() ?? Promise.resolve(0),
        content.getRenderingSettings(),
        content.getContentTexts?.() ?? Promise.resolve([]),
        content.getRenderableBlocs(),
    ]);
    return {
        route,
        artifactRevision: renderingRevision,
        renderingRevision,
        settings,
        contentTexts,
        renderableBlocs,
    };
}

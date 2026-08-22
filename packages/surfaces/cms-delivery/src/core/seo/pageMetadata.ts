import {
    canonicalSiteBaseUrl,
    resolvePageMetadataTemplateResult,
    type PageMetadataContext,
    type PageMetadataScope,
    type TPage,
    type TSystem,
} from "@bernouy/cms-content";

export type PageCanonicalIdentity = {
    queryParam: string;
    value: string | number;
};

export type PageRenderMetadata = {
    content?: PageMetadataScope;
    /** Undefined uses the static page canonical, null deliberately omits it. */
    canonical?: PageCanonicalIdentity | null;
    indexable?: boolean;
    fallbackTitle?: string;
};

export type ResolvedPageMetadata = {
    title: string;
    description: string;
    canonicalUrl: string | null;
    robots?: string;
    context: PageMetadataContext;
};

export function resolvePageMetadata(
    page: TPage,
    settings: TSystem,
    runtime: PageRenderMetadata = {},
): ResolvedPageMetadata {
    const context: PageMetadataContext = {
        content: runtime.content ?? {},
        page: { path: page.path },
        site: {
            host: settings.site.host,
            language: settings.site.language,
            name: settings.site.name,
        },
    };
    const titleTemplate = resolvePageMetadataTemplateResult(page.title, context);
    const descriptionTemplate = resolvePageMetadataTemplateResult(page.description, context);
    const title = titleTemplate.complete ? titleTemplate.value.trim() : "";
    const description = descriptionTemplate.complete ? descriptionTemplate.value.trim() : "";
    const canonical = runtime.canonical === undefined && page.indexing?.entity ? null : runtime.canonical;
    const canonicalUrl = buildCanonicalUrl(settings.site.host, page.path, canonical);
    const indexable = runtime.indexable ?? (page.indexing?.entity ? false : page.indexing?.enabled !== false);

    return {
        title: title || runtime.fallbackTitle?.trim() || settings.site.name,
        description,
        canonicalUrl: canonicalUrl ?? null,
        ...(indexable === false ? { robots: "noindex,follow" } : {}),
        context,
    };
}

function buildCanonicalUrl(
    hostValue: string,
    path: string,
    identity: PageCanonicalIdentity | null | undefined,
): string | undefined {
    if (identity === null) {
        return undefined;
    }
    const host = canonicalSiteBaseUrl(hostValue);
    if (!host) {
        return undefined;
    }
    const staticUrl = `${host}${path}`;
    if (!identity) {
        return staticUrl;
    }
    try {
        const canonical = new URL(staticUrl);
        canonical.search = "";
        canonical.searchParams.set(identity.queryParam, String(identity.value));
        return canonical.href;
    } catch {
        return undefined;
    }
}

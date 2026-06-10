/**
 * Generic extension point for `<head>` content. `renderPage` runs every
 * registered injector right after `buildHtmlBasics` (and before preloads,
 * meta tags, stylesheet, deferred scripts) so injectors are guaranteed to
 * land at the top of <head> in the order they were registered.
 *
 * Use cases: analytics tags, A/B testing snippets, observability agents,
 * `<link rel="preconnect">` to a third-party CDN — anything that needs to
 * be in <head> but isn't part of Delivery's own render pipeline.
 *
 * Injectors mutate the linkedom document in place. They receive the page's
 * bloc tag list because most extensions need it (analytics: which blocs
 * appear on which pages; A/B: gate experiments by bloc presence).
 */
export type HeadInjectorContext = {
    document: Document;
    head:     HTMLElement;
    usedTags: readonly string[];
};

export type HeadInjector = (ctx: HeadInjectorContext) => void;

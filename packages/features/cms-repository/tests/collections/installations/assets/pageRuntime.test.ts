import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS, defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { blocRuntimeCacheKey } from "@bernouy/cms-content/runtime-assets";
import { collectionBlocsetCacheKey, resolvePageAssets } from "@bernouy/cms-content/rendering";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { resolveInstalledCollectionAssets } from "@bernouy/cms-repository/collections/assets";

test("resolves collection asset expressions inside immutable Bloc JavaScript", async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "design-system",
            publisherId: "ulvia.official",
            version: "1.0.0",
            name: "collection.name",
            locale: "en",
            translations: { en: { "collection.name": "Design system" } },
            assets: [{ id: "mark.svg", mediaType: "image/svg+xml", byteLength: bytes.byteLength, digest }],
            blocs: [],
        },
        [{ id: "mark.svg", bytes }],
    );
    await store.install("site", artifact.digest, 0);
    const content = repositoryWith(
        'style.textContent = `.card { background-image: url("{{ cms.asset.design-system.mark.svg }}"); }`;',
    );
    const runtime = runtimeWith(content, { siteId: "site", store });

    const assets = await resolvePageAssets(
        {
            content: runtime.content,
            cache: runtime.cache,
            cmsPathPrefix: runtime.cmsPathPrefix,
            resolveContributedAssets: (input) =>
                resolveInstalledCollectionAssets(input, runtime.collectionAssets, runtime.basePath),
        },
        ["site-card"],
    );
    const revision = new URL(assets.blocUrls[0]!, "http://localhost").searchParams.get("r");
    expect(revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    const entry = runtime.cache.get(collectionBlocsetCacheKey(["site-card"], revision!));
    const js = new TextDecoder().decode(entry!.raw);

    expect(assets.blocUrls[0]).toContain(`r=${revision}`);
    expect(js).toContain("/.cms/collections/design-system/assets/mark.svg?v=");
    expect(js).toContain("background-image");
    expect(js).not.toContain("cms.asset.design-system.mark.svg");
});

function runtimeWith(content: ContentReader, collectionAssets: Parameters<typeof resolveInstalledCollectionAssets>[1]) {
    const cache = new InMemoryCache();
    cache.set(blocRuntimeCacheKey("/.cms/assets/bloc-runtime.js"), compress("bloc-runtime", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.STYLE, compress("body{}", "text/css"));
    return { basePath: "", cmsPathPrefix: "/.cms", cache, content, collectionAssets };
}

function repositoryWith(viewJS: string): ContentReader {
    const system = defaultSystem();
    const page = { path: "/", content: '<div cms-bloc="site-card"></div>' } as TPage;
    return {
        getRenderableBlocs: async () => [{ id: "site-card", name: "site-card", group: "", description: "" }],
        getBlocViewJS: async () => viewJS,
        getRenderingSettings: async () => system,
        getPublishedPage: async () => null,
        getPublishedPageById: async () => null,
        getPublishedPages: async () => [page],
        resolvePublishedRoute: async () => null,
        getContentRevision: async () => 1,
    };
}

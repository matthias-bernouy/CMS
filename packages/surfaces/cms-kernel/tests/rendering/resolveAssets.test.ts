import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS, defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { componentRuntimeCacheKey, loadComponentRuntimeEntry } from "cms-kernel/site/assets/browserRuntimeAssets";
import { collectionBlocsetCacheKey, resolveRuntimeAssets } from "cms-kernel/site/assets/resolveAssets";
import ComponentServer from "cms-kernel/endpoints/assets/component.server";
import type KernelCms from "cms-kernel/KernelCms";

const system = defaultSystem();
system.initializationStep = 1;
system.site.name = "Site";

function kernelWith(repository: ContentReader, collectionAssets?: KernelCms["collectionAssets"]): KernelCms {
    const cache = new InMemoryCache();
    cache.set(componentRuntimeCacheKey("/.cms/assets/component.js"), compress("component", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.STYLE, compress("body{}", "text/css"));

    return {
        basePath: "",
        cmsPathPrefix: "/.cms",
        cache,
        repository,
        collectionAssets,
    } as unknown as KernelCms;
}

function repositoryWith(options: {
    pageContent: string;
    blocTags: string[];
    viewJS?: Record<string, string | null>;
    collectionRevision?: number;
}): ContentReader {
    const page = {
        path: "/",
        title: "Home",
        description: "",
        content: options.pageContent,
        visible: true,
        tags: [],
    } as TPage;

    return {
        getRenderableBlocs: async () => options.blocTags.map((id) => ({ id, name: id, group: "", description: "" })),
        getBlocViewJS: async (tag: string) => options.viewJS?.[tag] ?? null,
        getRenderingSettings: async () => system,
        getPublishedPage: async () => null,
        getPublishedPageById: async () => null,
        getPublishedPages: async () => [page],
        resolvePublishedRoute: async () => null,
        ...(options.collectionRevision === undefined
            ? {}
            : { getContentRevision: async () => options.collectionRevision! }),
    };
}

describe("resolveRuntimeAssets", () => {
    test("exposes the generic component base through the public runtime bundle", async () => {
        const entry = await loadComponentRuntimeEntry();
        const js = new TextDecoder().decode(entry.raw);

        expect(entry.contentType).toBe("text/javascript");
        expect(js).toMatch(/window\.cmsRuntime\s*=\s*\{[\s\S]*\bComponent\b/);
        expect(js).not.toContain("syncProviderMediaImage");

        (window as any).cmsRuntime = {};
        window.eval(js);
        expect(typeof (window as any).cmsRuntime.Component).toBe("function");
        expect((window as any).cmsRuntime.Composition).toBeUndefined();
        expect((window as any).cmsRuntime.PROVIDER_IMAGE_WIDTHS).toBeUndefined();
    });

    test("serves the component bundle with a stable hashed URL", async () => {
        const kernel = { cache: new InMemoryCache() } as unknown as KernelCms;
        const current = await ComponentServer(new Request("http://localhost/.cms/assets/component.js"), kernel);
        const entry = await loadComponentRuntimeEntry();
        const immutable = await ComponentServer(
            new Request(`http://localhost/.cms/assets/component.js?v=${entry.hash}`),
            kernel,
        );
        expect(current.status).toBe(200);
        expect(immutable.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        (window as any).cmsRuntime = {};
        window.eval(await immutable.text());
        expect(typeof (window as any).cmsRuntime.Component).toBe("function");

        const unknown = await ComponentServer(
            new Request("http://localhost/.cms/assets/component.js?v=unknown"),
            kernel,
        );
        expect(unknown.status).toBe(404);
        expect(unknown.headers.get("cache-control")).toBe("no-store");
    });

    test("does not emit a blocset script for native-only blocs without viewJS", async () => {
        const assets = await resolveRuntimeAssets(
            kernelWith(
                repositoryWith({
                    pageContent: "<p>Hello</p><form><label>Email</label><input></form>",
                    blocTags: ["p", "form", "label", "input"],
                }),
            ),
            ["p", "form", "label", "input"],
        );

        expect(assets.blocUrls).toEqual([]);
        expect(assets.scriptUrls).toEqual([expect.stringContaining("/.cms/assets/component.js?v=")]);
    });

    test("keeps a blocset script when at least one referenced bloc has viewJS", async () => {
        const assets = await resolveRuntimeAssets(
            kernelWith(
                repositoryWith({
                    pageContent: "<p>Hello</p><site-card></site-card>",
                    blocTags: ["p", "site-card"],
                    viewJS: { "site-card": "customElements.define('site-card', class extends HTMLElement {});" },
                }),
            ),
            ["p", "site-card"],
        );

        expect(assets.blocUrls).toHaveLength(1);
        expect(assets.blocUrls[0]).toContain("tags=p,site-card");
        expect(assets.scriptUrls).toHaveLength(2);
    });

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
        const repository = repositoryWith({
            pageContent: "<site-card></site-card>",
            blocTags: ["site-card"],
            viewJS: {
                "site-card":
                    'style.textContent = `.card { background-image: url("{{ cms.asset.design-system.mark.svg }}"); }`;',
            },
            collectionRevision: 1,
        });
        const kernel = kernelWith(repository, { siteId: "site", store });

        const assets = await resolveRuntimeAssets(kernel, ["site-card"]);
        const entry = kernel.cache.get(collectionBlocsetCacheKey(["site-card"], 1));
        const js = new TextDecoder().decode(entry!.raw);

        expect(assets.blocUrls[0]).toContain("r=1");
        expect(js).toContain("/.cms/collections/design-system/assets/mark.svg?v=");
        expect(js).toContain("background-image");
        expect(js).not.toContain("cms.asset.design-system.mark.svg");
    });
});

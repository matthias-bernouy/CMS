import { describe, expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { defaultSystem, P9R_CACHE, type ContentReader, type TPage } from "@bernouy/cms-content";
import { componentJsCacheKey, generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import { resolveRuntimeAssets } from "cms-delivery/core/assets/resolveAssets";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import type DeliveryCms from "cms-delivery/DeliveryCms";

const system = defaultSystem();
system.initializationStep = 1;
system.site.name = "Site";

function deliveryWith(repository: ContentReader): DeliveryCms {
    const cache = new InMemoryCache();
    cache.set(componentJsCacheKey("/.cms/assets/component.js"), compress("component", "text/javascript"));
    cache.set(P9R_CACHE.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(P9R_CACHE.STYLE, compress("body{}", "text/css"));

    return {
        cmsPathPrefix: "/.cms",
        cache,
        repository,
    } as unknown as DeliveryCms;
}

function repositoryWith(options: {
    pageContent: string;
    blocTags: string[];
    viewJS?: Record<string, string | null>;
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
    };
}

describe("resolveRuntimeAssets", () => {
    test("exposes components and provider images through the public runtime bundle", async () => {
        const entry = await generateComponentJsEntry();
        const js = new TextDecoder().decode(entry.raw);

        expect(entry.contentType).toBe("text/javascript");
        expect(js).toMatch(/window\.p9r\s*=\s*\{[\s\S]*Component\s*:/);
        expect(js).toContain("syncProviderMediaImage");
        expect(js).not.toContain("syncResponsiveSourceImageElement");

        (window as any).p9r = {};
        window.eval(js);
        expect((window as any).p9r.Composition).toBeUndefined();
        expect((window as any).p9r.PROVIDER_IMAGE_WIDTHS).toEqual([
            64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560,
        ]);
    });

    test("serves a provider media bundle with a stable hashed URL", async () => {
        const delivery = { cache: new InMemoryCache() } as unknown as DeliveryCms;
        const current = await ComponentServer(new Request("http://localhost/.cms/assets/component.js"), delivery);
        const entry = await generateComponentJsEntry();
        const immutable = await ComponentServer(
            new Request(`http://localhost/.cms/assets/component.js?v=${entry.hash}`),
            delivery,
        );
        expect(current.status).toBe(200);
        expect(immutable.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        (window as any).p9r = {};
        window.eval(await immutable.text());
        const image = document.createElement("img");
        image.setAttribute("data-cms-src", "/.cms/media/catalog/photo/file-7");
        image.setAttribute("data-cms-width", "800");
        image.setAttribute("data-cms-height", "600");
        (window as any).p9r.syncProviderMediaImage(image);
        expect(image.getAttribute("srcset")).toContain("/.cms/image/catalog/photo/file-7/384.webp 384w");

        const unknown = await ComponentServer(
            new Request("http://localhost/.cms/assets/component.js?v=unknown"),
            delivery,
        );
        expect(unknown.status).toBe(404);
        expect(unknown.headers.get("cache-control")).toBe("no-store");
    });

    test("does not emit a blocset script for native-only blocs without viewJS", async () => {
        const assets = await resolveRuntimeAssets(
            deliveryWith(
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
            deliveryWith(
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
});

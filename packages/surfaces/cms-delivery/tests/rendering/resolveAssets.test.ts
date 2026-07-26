import { describe, expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { defaultSystem, P9R_CACHE, type ContentReader, type TPage } from "@bernouy/cms-content";
import { componentJsCacheKey, generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import { resolveRuntimeAssets } from "cms-delivery/core/assets/resolveAssets";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { ResponsiveSourceImageRollout } from "@bernouy/cms-source-images/browser-host";

const system = defaultSystem();
system.initializationStep = 1;
system.site.name = "Site";

function deliveryWith(
    repository: ContentReader,
    responsiveSourceImageRollout: ResponsiveSourceImageRollout = { public: false, private: false },
): DeliveryCms {
    const cache = new InMemoryCache();
    cache.set(
        componentJsCacheKey("/.cms/assets/component.js", responsiveSourceImageRollout),
        compress("component", "text/javascript"),
    );
    cache.set(P9R_CACHE.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(P9R_CACHE.STYLE, compress("body{}", "text/css"));

    return {
        cmsPathPrefix: "/.cms",
        cache,
        repository,
        responsiveSourceImageRollout,
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
        getAllPages: async () => [page],
        getBlocsList: async () => options.blocTags.map((id) => ({ id, name: id, group: "", description: "" })),
        getBlocViewJS: async (tag: string) => options.viewJS?.[tag] ?? null,
        getSystem: async () => system,
        getPage: async () => null,
        getPublishedPage: async () => null,
        getPublishedPages: async () => [page],
    };
}

describe("resolveRuntimeAssets", () => {
    test("exposes components and enabled responsive Source images through the public runtime bundle", async () => {
        const entry = await generateComponentJsEntry({ public: true, private: true });
        const js = new TextDecoder().decode(entry.raw);

        expect(entry.contentType).toBe("text/javascript");
        expect(js).toMatch(/window\.p9r\s*=\s*\{[\s\S]*Component\s*:/);
        expect(js).toMatch(/window\.p9r\s*=\s*\{[\s\S]*Composition\s*:/);
        expect(js).toContain("syncResponsiveSourceImageElement");
        expect(js).toContain("cms-width");

        (window as any).p9r = {};
        window.eval(js);
        expect((window as any).p9r.SOURCE_IMAGE_WIDTHS).toEqual([
            64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560,
        ]);
        expect((window as any).p9r.createResponsiveSourceImageBrowserApi).toBeUndefined();
    });

    test.each([
        ["dark", { public: false, private: false }, false, false],
        ["public only", { public: true, private: false }, true, false],
        ["private only", { public: false, private: true }, false, true],
        ["fully enabled", { public: true, private: true }, true, true],
    ] as const)(
        "executes the public component runtime with responsive markup %s",
        async (_label, rollout, publicEnabled, privateEnabled) => {
            const response = await ComponentServer(new Request("http://localhost/.cms/assets/component.js"), {
                cache: new InMemoryCache(),
                responsiveSourceImageRollout: rollout,
            } as unknown as DeliveryCms);
            (window as any).p9r = {};
            window.eval(await response.text());
            const publicImage = sourceImage("public");
            const privateImage = sourceImage();

            expect((window as any).p9r.syncResponsiveSourceImageElement(publicImage)).toBe(publicEnabled);
            expect((window as any).p9r.syncResponsiveSourceImageElement(privateImage)).toBe(privateEnabled);
            for (const [image, enabled] of [
                [publicImage, publicEnabled],
                [privateImage, privateEnabled],
            ] as const) {
                expect(image.getAttribute("src")).toBe("/.cms/sources/catalog/image?id=7");
                expect(image.hasAttribute("srcset")).toBe(enabled);
                expect(image.getAttribute("srcset")?.includes("cms-width") ?? false).toBe(enabled);
            }
        },
    );

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

function sourceImage(access?: "public"): HTMLImageElement {
    const image = document.createElement("img");
    image.setAttribute("data-src", "/.cms/sources/catalog/image?id=7");
    image.setAttribute("data-source-width", "800");
    image.setAttribute("data-source-height", "600");
    image.setAttribute("loading", "lazy");
    if (access) {
        image.setAttribute("data-source-image-access", access);
    }
    return image;
}

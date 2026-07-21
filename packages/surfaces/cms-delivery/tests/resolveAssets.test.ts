import { describe, expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { P9R_CACHE, type ContentReader, type TPage, type TSystem } from "@bernouy/cms-content";
import { generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import { resolveRuntimeAssets } from "cms-delivery/core/assets/resolveAssets";
import type DeliveryCms from "cms-delivery/DeliveryCms";

const system: TSystem = {
    initializationStep: 1,
    site: {
        name: "Site",
        favicon: "",
        visible: true,
        host: "",
        language: "",
        theme: "",
        notFound: null,
        forbidden: null,
        serverError: null,
        login: null,
    },
    editor: { layoutCategory: "" },
    security: { connectExtras: [], mediaExtras: [] },
};

function deliveryWith(repository: ContentReader): DeliveryCms {
    const cache = new InMemoryCache();
    cache.set(P9R_CACHE.js("/.cms/assets/component.js"), compress("component", "text/javascript"));
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
    test("exposes Component and Composition through the public runtime bundle", async () => {
        const entry = await generateComponentJsEntry();
        const js = new TextDecoder().decode(entry.raw);

        expect(entry.contentType).toBe("text/javascript");
        expect(js).toMatch(/window\.p9r\s*=\s*\{[\s\S]*Component\s*:/);
        expect(js).toMatch(/window\.p9r\s*=\s*\{[\s\S]*Composition\s*:/);
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

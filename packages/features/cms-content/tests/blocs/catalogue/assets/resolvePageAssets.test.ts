import { describe, expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS, defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { blocRuntimeCacheKey } from "@bernouy/cms-content/runtime-assets";
import { resolvePageAssets } from "@bernouy/cms-content/rendering";

const system = defaultSystem();
system.initializationStep = 1;
system.site.name = "Site";

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

async function resolveAssets(content: ContentReader, tags: string[]) {
    const cache = new InMemoryCache();
    cache.set(blocRuntimeCacheKey("/.cms/assets/bloc-runtime.js"), compress("bloc-runtime", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.STYLE, compress("body{}", "text/css"));
    return resolvePageAssets(
        {
            content,
            cache,
            cmsPathPrefix: "/.cms",
            resolveContributedAssets: async (input) => input,
        },
        tags,
    );
}

describe("resolvePageAssets", () => {
    test("does not emit a blocset script for native-only blocs without viewJS", async () => {
        const assets = await resolveAssets(
            repositoryWith({
                pageContent: "<p>Hello</p><form><label>Email</label><input></form>",
                blocTags: ["p", "form", "label", "input"],
            }),
            ["p", "form", "label", "input"],
        );

        expect(assets.blocUrls).toEqual([]);
        expect(assets.scriptUrls).toEqual([expect.stringContaining("/.cms/assets/bloc-runtime.js?v=")]);
    });

    test("keeps a blocset script when at least one referenced bloc has viewJS", async () => {
        const assets = await resolveAssets(
            repositoryWith({
                pageContent: '<p>Hello</p><div cms-bloc="site-card"></div>',
                blocTags: ["p", "site-card"],
                viewJS: { "site-card": "export function mount() {}" },
            }),
            ["p", "site-card"],
        );

        expect(assets.blocUrls).toHaveLength(1);
        expect(assets.blocUrls[0]).toContain("tags=site-card");
        expect(assets.scriptUrls).toHaveLength(2);
    });
});

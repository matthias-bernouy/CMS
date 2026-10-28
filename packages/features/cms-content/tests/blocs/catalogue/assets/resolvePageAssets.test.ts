import { describe, expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS, defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { blocRuntimeCacheKey } from "@bernouy/cms-content/runtime-assets";
import { digestContentRevision, resolvePageAssets } from "@bernouy/cms-content/rendering";

const system = defaultSystem();
system.initializationStep = 1;
system.site.name = "Site";

function repositoryWith(options: {
    pageContent: string;
    blocTags: string[];
    viewJS?: Record<string, string | null>;
    styles?: Record<string, { css: string; group: string }>;
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
        getRenderableBlocs: async () =>
            options.blocTags.map((id) => ({
                id,
                name: id,
                group: "",
                description: "",
                root: { accepts: ["div"] },
                hasBehavior: Boolean(options.viewJS?.[id]),
                ...(options.styles?.[id]
                    ? { styleCSS: options.styles[id]!.css, styleCollectionId: options.styles[id]!.group }
                    : {}),
            })),
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
    cache.set(blocRuntimeCacheKey("/_content/assets/bloc-runtime.js"), compress("bloc-runtime", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.js("/_content/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(
        CMS_CACHE_KEYS.style(
            await digestContentRevision(
                (await content.getRenderingRevision?.()) ?? (await content.getContentRevision?.()) ?? 0,
            ),
        ),
        compress("body{}", "text/css"),
    );
    return resolvePageAssets(
        {
            content,
            cache,
            cmsPathPrefix: "/_content",
            resolveContributedAssets: async (input) => input,
        },
        tags,
    );
}

describe("resolvePageAssets", () => {
    test("versions the global stylesheet with the content revision", async () => {
        const content = repositoryWith({ pageContent: "<p>Hello</p>", blocTags: [] });
        content.getContentRevision = async () => 42;

        const assets = await resolveAssets(content, []);

        expect(assets.styleUrl).toMatch(/\/_content\/style\?r=sha256:[0-9a-f]{64}&v=[0-9a-f]{10}$/u);
    });

    test("changes the global stylesheet URL when rendering settings change alone", async () => {
        const content = repositoryWith({ pageContent: "<p>Hello</p>", blocTags: [] });
        content.getContentRevision = async () => 42;
        content.getRenderingRevision = async () => "42:1";
        const first = await resolveAssets(content, []);

        content.getRenderingRevision = async () => "42:2";
        const second = await resolveAssets(content, []);

        expect(first.styleUrl.split("&v=")[0]).not.toBe(second.styleUrl.split("&v=")[0]);
    });

    test("reads the renderable Bloc catalogue once on a cold resolution", async () => {
        const content = repositoryWith({
            pageContent: '<section cms-bloc="collection-card"></section>',
            blocTags: ["collection-card"],
        });
        const read = content.getRenderableBlocs;
        let reads = 0;
        content.getRenderableBlocs = async () => {
            reads += 1;
            return read();
        };

        await resolveAssets(content, ["collection-card"]);

        expect(reads).toBe(1);
    });

    test("does not read unrelated published Pages to resolve one Page's assets", async () => {
        const content = repositoryWith({
            pageContent: '<section cms-bloc="collection-card"></section>',
            blocTags: ["collection-card"],
        });
        content.getPublishedPages = async () => {
            throw new Error("unrelated published Pages must not be read");
        };

        await expect(resolveAssets(content, ["collection-card"])).resolves.toBeDefined();
    });

    test("does not emit a blocset script for native-only blocs without viewJS", async () => {
        const assets = await resolveAssets(
            repositoryWith({
                pageContent: "<p>Hello</p><form><label>Email</label><input></form>",
                blocTags: ["p", "form", "label", "input"],
            }),
            ["p", "form", "label", "input"],
        );

        expect(assets.blocUrls).toEqual([]);
        expect(assets.scriptUrls).toEqual([]);
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

    test("serves only the CSS fragments required by a Page without a blocset", async () => {
        const assets = await resolveAssets(
            repositoryWith({
                pageContent: '<section cms-bloc="collection-card"></section>',
                blocTags: ["collection-card", "collection-panel"],
                styles: {
                    "collection-card": { css: "@scope (.card) {}", group: "collection" },
                    "collection-panel": { css: "@scope (.panel) {}", group: "collection" },
                },
            }),
            ["collection-card"],
        );

        expect(assets.blocUrls).toEqual([]);
        expect(assets.scriptUrls).toEqual([]);
        expect(assets.blocStyleUrls).toHaveLength(1);
        expect(assets.blocStyleUrls[0]).toContain("/_content/blocstyles?collection=collection&tags=collection-card");
        const entry = await resolveAssets(
            repositoryWith({
                pageContent: '<section cms-bloc="collection-panel"></section>',
                blocTags: ["collection-card", "collection-panel"],
                styles: {
                    "collection-card": { css: "@scope (.card) {}", group: "collection" },
                    "collection-panel": { css: "@scope (.panel) {}", group: "collection" },
                },
            }),
            ["collection-panel"],
        );
        expect(entry.blocStyleUrls[0]).toContain("tags=collection-panel");
        expect(entry.blocStyleUrls[0]?.split("&v=")[1]).not.toBe(assets.blocStyleUrls[0]?.split("&v=")[1]);
    });
});

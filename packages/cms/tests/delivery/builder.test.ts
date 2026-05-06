import { describe, test, expect } from "bun:test";
import type { CDN } from "@bernouy/core";
import { DeliveryBuilder } from "src/delivery/build/DeliveryBuilder";
import { InMemoryCDN, makeCdnFetcher } from "src/delivery/build/InMemoryCDN";
import type { BuildAssetsContext } from "src/delivery/build/buildAssets";
import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";
import type { VariantGenerator } from "src/delivery/interfaces/VariantGenerator";
import type { EnhancementPlan } from "src/delivery/core/enhance/planEnhancement";
import type { TPage, TSnippet, TSystem } from "src/socle/interfaces/models";
import { putHashedAsset } from "src/delivery/build/cdnIO";
import { sha256Hex } from "src/delivery/build/sha256";

/* --------------------------------- fakes --------------------------------- */

/** Mutable repository so a single test can simulate edits / deletes between
 *  `runOnce` calls without re-instantiating the builder. */
function mutableRepo(initial: TPage[] = []): DeliveryRepository & {
    set(pages: TPage[]): void;
    edit(path: string, patch: Partial<TPage>): void;
    remove(path: string): void;
} {
    let pages = [...initial];
    const system: TSystem = {
        initializationStep: 0,
        site: {
            name: "Test", favicon: "", visible: true, host: "",
            language: "", theme: "/* css */",
            notFound: null, serverError: null,
        },
        editor: { layoutCategory: "" },
    };
    const repo: any = {
        getPage:        async (path: string) => pages.find(p => p.path === path) ?? null,
        getAllPages:    async () => pages,
        getBlocsList:   async () => [],
        getBlocViewJS:  async () => null,
        getSystem:      async () => system,
        getSnippetByIdentifier: async (_id: string): Promise<TSnippet | null> => null,
        getAllSnippets:         async (): Promise<TSnippet[]> => [],
        set: (next: TPage[]) => { pages = [...next]; },
        edit: (path: string, patch: Partial<TPage>) => {
            pages = pages.map(p => p.path === path ? { ...p, ...patch } : p);
        },
        remove: (path: string) => { pages = pages.filter(p => p.path !== path); },
    };
    return repo;
}

const fakeGenerator: VariantGenerator = {
    generate: async (spec) => {
        const seed = `${spec.originalUrl}|${spec.width}|${spec.format ?? ""}`;
        const bytes = new TextEncoder().encode(`bytes:${seed}`);
        return {
            hash: await sha256Hex(seed),
            bytes,
            contentType: "image/webp",
            extension: ".webp",
        };
    },
};

/** Stub `BuildAssetsContext` factory: uploads a single tiny "component" /
 *  "style" / "favicon" payload to the bucket so the manifest exercise is
 *  realistic, but skips `Bun.build` entirely. */
function stubAssetsContext(
    sharedSeed: string = "default",
): (assetsBucket: CDN, _repo: DeliveryRepository) => Promise<BuildAssetsContext> {
    return async (assetsBucket) => {
        const blocUrlByTag  = new Map<string, string>();
        const blocHashByTag = new Map<string, string>();
        const sharedHashes: Record<string, string> = {};
        let fresh = 0;

        const place = async (kind: "component" | "style" | "favicon", body: string, mime: string, ext: string) => {
            const hash = await sha256Hex(`${kind}:${sharedSeed}:${body}`);
            const r = await putHashedAsset(assetsBucket, {
                hash,
                bytes: new TextEncoder().encode(body),
                contentType: mime,
                extension: ext,
            });
            if (r.fresh) fresh++;
            sharedHashes[kind] = hash;
            return r.absoluteURL;
        };

        const componentUrl = await place("component", `/* component ${sharedSeed} */`, "text/javascript", ".js");
        const styleUrl     = await place("style",     `/* css ${sharedSeed} */`,       "text/css",       ".css");
        const faviconUrl   = await place("favicon",   `<svg/>`,                        "image/svg+xml",  ".svg");

        return {
            componentUrl, styleUrl, faviconUrl,
            sharedAssetHashes: () => {
                const out = { ...sharedHashes };
                for (const [tag, h] of blocHashByTag) out[`bloc:${tag}`] = h;
                return out;
            },
            freshUploads: () => fresh,
            resolveAssets: async (_usedTags) => ({
                componentUrl, styleUrl, blocUrls: [], scriptUrls: [componentUrl],
            }),
        };
    };
}

const tpage = (over: Partial<TPage> & { path: string }): TPage => ({
    id: "p", title: "T", description: "D", content: "<p>hi</p>", visible: true, tags: [],
    ...over,
});

function makeBuilder(opts: {
    html: InMemoryCDN;
    assets: InMemoryCDN;
    repository: DeliveryRepository;
    enhancePage?: (path: string, html: string) => Promise<EnhancementPlan>;
    sharedSeed?: string;
}): DeliveryBuilder {
    return new DeliveryBuilder({
        repository: opts.repository,
        htmlBucket: opts.html,
        assetsBucket: opts.assets,
        generator: fakeGenerator,
        fetcher: makeCdnFetcher([opts.html, opts.assets]),
        createAssetsContext: stubAssetsContext(opts.sharedSeed),
        ...(opts.enhancePage ? { enhancePage: opts.enhancePage } : {}),
    });
}

/* ---------------------------------- tests --------------------------------- */

describe("DeliveryBuilder.runOnce — basic lifecycle", () => {
    test("cold deploy uploads pages, shared assets and manifest", async () => {
        const html   = new InMemoryCDN({ urlPrefix: "https://html.test" });
        const assets = new InMemoryCDN({ urlPrefix: "https://assets.test" });
        const repo   = mutableRepo([tpage({ path: "/about" }), tpage({ path: "/" })]);
        const builder = makeBuilder({ html, assets, repository: repo });

        const r = await builder.runOnce();
        expect(r.changed).toBe(true);
        expect(r.pagesUploaded).toBe(2);
        expect(r.sharedAssetsUploaded).toBe(3); // component, style, favicon
        expect(r.assetsDeleted).toBe(0);
        // /about + index + manifest in html bucket; 3 shared assets in assets bucket.
        expect(html.size()).toBe(3);
        expect(assets.size()).toBe(3);
    });

    test("rerun without repo change short-circuits", async () => {
        const html   = new InMemoryCDN();
        const assets = new InMemoryCDN();
        const repo   = mutableRepo([tpage({ path: "/about" })]);
        const builder = makeBuilder({ html, assets, repository: repo });

        await builder.runOnce();
        const r2 = await builder.runOnce();
        expect(r2.changed).toBe(false);
        expect(r2.pagesUploaded).toBe(0);
    });

    test("page edit re-uploads only the changed page", async () => {
        const html   = new InMemoryCDN();
        const assets = new InMemoryCDN();
        const repo   = mutableRepo([
            tpage({ path: "/about" }),
            tpage({ path: "/contact" }),
        ]);
        const builder = makeBuilder({ html, assets, repository: repo });

        await builder.runOnce();
        repo.edit("/about", { content: "<p>edited</p>" });
        const r2 = await builder.runOnce();

        expect(r2.changed).toBe(true);
        expect(r2.pagesUploaded).toBe(1);
    });

    test("page deleted from repo is removed from html bucket", async () => {
        const html   = new InMemoryCDN();
        const assets = new InMemoryCDN();
        const repo   = mutableRepo([
            tpage({ path: "/about" }),
            tpage({ path: "/contact" }),
        ]);
        const builder = makeBuilder({ html, assets, repository: repo });

        await builder.runOnce();
        const beforeHtml = html.size();
        repo.remove("/contact");
        const r2 = await builder.runOnce();

        expect(r2.pagesDeleted).toBe(1);
        // /about + index? no — only the two pages, so removing one drops bucket count.
        expect(html.size()).toBe(beforeHtml - 1);
    });
});

describe("DeliveryBuilder.runOnce — variants", () => {
    /** Stub enhancer: pretend every <img src="X"> needs widths [400, 800]. */
    const imgPlanner = async (_path: string, html: string): Promise<EnhancementPlan> => {
        const matches = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]!);
        const variantsNeeded = matches.flatMap((src, idx) => [
            { originalUrl: src, width: 400 },
            { originalUrl: src, width: 800 },
        ]);
        const rewrites = matches.map((_, idx) => ({
            index: idx, widths: [400, 800], sizes: "100vw",
        }));
        return { rewrites, variantsNeeded };
    };

    test("variants are deduplicated across pages sharing an image", async () => {
        const html   = new InMemoryCDN();
        const assets = new InMemoryCDN();
        const repo   = mutableRepo([
            tpage({ path: "/a", content: `<img src="https://cdn/img.jpg">` }),
            tpage({ path: "/b", content: `<img src="https://cdn/img.jpg">` }),
        ]);
        const builder = makeBuilder({ html, assets, repository: repo, enhancePage: imgPlanner });

        const r = await builder.runOnce();
        // 2 widths × 1 unique URL = 2 variants (not 4).
        expect(r.variantsUploaded).toBe(2);
    });

    test("orphaned variants are GCed when a page stops referencing them", async () => {
        const html   = new InMemoryCDN();
        const assets = new InMemoryCDN();
        const repo   = mutableRepo([
            tpage({ path: "/a", content: `<img src="https://cdn/img.jpg">` }),
        ]);
        const builder = makeBuilder({ html, assets, repository: repo, enhancePage: imgPlanner });

        await builder.runOnce();
        const beforeAssets = assets.size();
        repo.edit("/a", { content: `<img src="https://cdn/other.jpg">` });
        const r2 = await builder.runOnce();

        // 2 new variants for `other.jpg`, 2 orphans deleted (img.jpg variants).
        expect(r2.variantsUploaded).toBe(2);
        expect(r2.assetsDeleted).toBe(2);
        // Net: 3 shared + 2 fresh variants = 5 assets after GC.
        expect(assets.size()).toBe(beforeAssets); // same total: 3 shared + 2 variants either way
    });
});

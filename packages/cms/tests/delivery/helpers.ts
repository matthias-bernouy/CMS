import type { Runner, MediaUrlBuilder } from "@bernouy/socle";
import type { Cache, CacheEntry } from "src/socle/interfaces/Cache";
import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";
import type { TPage, TSnippet, TSystem, TPageRef } from "src/socle/interfaces/models";
import type DeliveryCms from "src/delivery/DeliveryCms";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

/**
 * Minimum-viable CacheEntry for tests. The consumer only ever reads `.hash`
 * (for content-addressed URL building) and `.raw` (for HTML re-serialization
 * during re-serve). Everything else is stubbed.
 */
function dummyEntry(raw = ""): CacheEntry {
    const bytes = new TextEncoder().encode(raw);
    return {
        raw: bytes,
        brotli: bytes,
        gzip: bytes,
        contentType: "application/octet-stream",
        hash: "0123456789",
    };
}

/**
 * Map-backed cache that stores unconditionally. `DeliveryCache` bypasses
 * reads/writes in DEV; tests need the actual storage semantics so
 * `getOrGenerateEntryAsync` hits the cache on the second call instead of
 * re-running expensive generators (e.g. `Bun.build` for component.js).
 */
export function testCache(): Cache {
    const store = new Map<string, CacheEntry>();
    return {
        get: (k) => store.get(k) ?? null,
        set: (k, v) => { store.set(k, v); },
        delete: (k) => { store.delete(k); },
        deleteMatching: (p) => {
            for (const k of store.keys()) if (p(k)) store.delete(k);
        },
    };
}

/**
 * Tiny MediaUrlBuilder stub. `formatImageUrl` appends `?w=<width>` to the
 * source URL so tests can assert on the derived variant URL. The ladder
 * defaults to something generous enough that `computeSrcset` produces a
 * non-trivial result.
 */
export function testMedia(opts: { ladder?: number[] } = {}): MediaUrlBuilder {
    return {
        imageConfig: {
            maxWidth: 4000,
            maxHeight: 4000,
            ladderWidths: opts.ladder ?? [300, 600, 1200, 2400],
            ladderFormats: ["webp"],
            defaultQuality: 80,
        },
        formatImageUrl: ({ url, width, height }) => {
            const u = new URL(url, "http://fake.local");
            if (width)  u.searchParams.set("w", String(width));
            if (height) u.searchParams.set("h", String(height));
            return u;
        },
    };
}

/**
 * Runner stub that just records every `addEndpoint` / `setDefaultEndpoint`
 * call. Consumers look at `_endpoints` / `_default` to assert on the wiring.
 */
export function testRunner(basePath = "/") {
    const endpoints: { method: string; path: string; handler: (req: Request) => Response | Promise<Response> }[] = [];
    let def: { method: string; handler: (req: Request) => Response | Promise<Response> } | null = null;
    const runner: any = {
        basePath,
        addEndpoint: (method: string, path: string, handler: any) => {
            endpoints.push({ method, path, handler });
        },
        setDefaultEndpoint: (method: string, handler: any) => {
            def = { method, handler };
        },
        use:    () => {},
        group:  () => {},
        get:    () => {},
        post:   () => {},
        put:    () => {},
        delete: () => {},
        patch:  () => {},
        start:  () => {},
    };
    runner._endpoints = endpoints;
    runner._getDefault = () => def;
    return runner as Runner & { _endpoints: typeof endpoints; _getDefault: () => typeof def };
}

export type TestRepositoryOpts = {
    pages?:     TPage[];
    blocs?:     { id: string; name: string; group: string; description: string }[];
    snippets?:  Record<string, string>;
    settings?:  Partial<TSystem["site"]>;
    notFound?:  TPageRef;
    serverError?: TPageRef;
};

export function testRepository(opts: TestRepositoryOpts = {}): DeliveryRepository {
    const site: TSystem["site"] = {
        name: "Test",
        favicon: "",
        visible: true,
        host: "",
        language: "",
        theme: "",
        notFound:    opts.notFound    ?? null,
        serverError: opts.serverError ?? null,
        ...opts.settings,
    };
    const system: TSystem = {
        initializationStep: 0,
        site,
        editor: { layoutCategory: "" },
    };

    return {
        getPage: async (path) => {
            return (opts.pages ?? []).find(p => p.path === path) ?? null;
        },
        getAllPages: async () => opts.pages ?? [],
        getBlocsList: async () => opts.blocs ?? [],
        getBlocViewJS: async (tag) => {
            const known = (opts.blocs ?? []).some(b => b.id === tag);
            return known ? `/* ${tag} */` : null;
        },
        getSystem: async () => system,
        getSnippetByIdentifier: async (id): Promise<TSnippet | null> => {
            if (!opts.snippets || !(id in opts.snippets)) return null;
            return {
                id: `snippet-${id}`,
                identifier: id,
                name: id,
                description: "",
                content: opts.snippets[id]!,
                category: "",
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        },
    };
}

/**
 * Builds a duck-typed `DeliveryCms` with all fields stubbed. The `enhancer`
 * is a no-op so `handlePageRequest` doesn't try to launch Playwright. Use
 * `makeRealDelivery` when you actually want to exercise the constructor.
 */
export function makeDelivery(opts: {
    basePath?: string;
    repository?: DeliveryRepository;
    cache?: Cache;
    media?: MediaUrlBuilder;
    enhancer?: { enhance: (path: string, origin: string) => Promise<void> };
} = {}): DeliveryCms {
    const runner = testRunner(opts.basePath ?? "/");
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    const cache = opts.cache ?? testCache();

    // Pre-seed the component.js bundle entry so `resolveAssets` doesn't
    // trigger `Bun.build` during tests — Bun's bundler has been observed to
    // disturb module resolution for multi-dot filenames (`*.server.ts`)
    // imported by other test files in the same run. The dummy entry still
    // exposes a `hash`, which is all `renderPage` reads.
    cache.set(P9R_CACHE.js(`${basePath}/.cms/assets/component.js`), dummyEntry());

    const delivery: any = {
        runner,
        media:         opts.media      ?? testMedia(),
        repository:    opts.repository ?? testRepository(),
        cache,
        enhancer:      opts.enhancer   ?? { enhance: async () => {} },
        headInjectors: [],
        basePath,
        cmsPathPrefix: basePath + "/.cms",
    };
    return delivery as DeliveryCms;
}

export function page(over: Partial<TPage> = {}): TPage {
    return {
        id: "test-page",
        path: "/about",
        title: "About",
        description: "About desc",
        content: "<p>about body</p>",
        visible: true,
        tags: [],
        ...over,
    };
}

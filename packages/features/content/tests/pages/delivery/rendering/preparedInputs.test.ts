import { expect, test } from "bun:test";
import { createContentReader, defaultSystem, InMemoryContentRepository, type TPage } from "@bernouy/content";
import type { RenderingResourceReads } from "@bernouy/content/rendering";
import { mountPublicPages } from "../routing/publicPage.fixture";

function fixture() {
    const system = defaultSystem();
    system.initializationStep = 1;
    system.site.visible = true;
    system.site.language = "en";
    const page: TPage = {
        id: "home",
        revision: 1,
        path: "/",
        title: "Home",
        description: "Home page",
        content: "<main>Hello</main>",
        visible: true,
        tags: [],
    };
    const counts = { revisions: 0, texts: 0, blocs: 0, prepared: 0, closed: 0 };
    let revision = 1;
    let fail = false;
    let onLoad = () => {};
    let captured: RenderingResourceReads | undefined;
    const repository = Object.assign(new InMemoryContentRepository(), {
        getSystem: async () => structuredClone(system),
        getPageRoute: async (path: string) =>
            path === "/"
                ? { path, state: "current" as const, pageId: page.id, ownerPageId: page.id, language: "en" }
                : null,
        getPageById: async () => structuredClone(page),
        getTextContributionsRevision: async () => {
            counts.revisions++;
            return revision;
        },
        getTextContributions: async (reads?: RenderingResourceReads) => {
            captured = reads;
            counts.texts++;
            onLoad();
            if (fail) {
                throw new Error("unavailable");
            }
            return { revision, texts: [] };
        },
        getBlocsList: async () => {
            counts.blocs++;
            return [];
        },
    });
    const reader = createContentReader(repository);
    const prepare = reader.preparePageRenderInputs!;
    reader.preparePageRenderInputs = async (path) => {
        counts.prepared++;
        const prepared = await prepare(path);
        return {
            ...prepared,
            close: () => {
                counts.closed++;
                prepared.close();
            },
        };
    };
    return {
        reader,
        system,
        counts,
        captured: () => captured,
        change: () => {
            revision++;
            page.title = "Changed title";
        },
        onLoad: (callback: () => void) => {
            onLoad = callback;
        },
        fail: (value: boolean) => {
            fail = value;
        },
    };
}

test("Provider HTML hits load only revision metadata; MISS output matches eager delivery byte for byte", async () => {
    const f = fixture();
    const candidate = mountPublicPages({ repository: f.reader });
    const bodies: string[] = [];
    for (let index = 0; index < 32; index++) {
        const response = await candidate.get(new Request("https://example.test/"));
        expect(response.status).toBe(200);
        bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(f.counts).toEqual({ revisions: 32, texts: 1, blocs: 1, prepared: 32, closed: 32 });
    await expect(f.captured()!.resource({}, "late", async () => 1)).rejects.toThrow("closed");
    const legacy = fixture();
    const eager = mountPublicPages({ repository: { ...legacy.reader, preparePageRenderInputs: undefined } });
    expect(await (await eager.get(new Request("https://example.test/"))).text()).toBe(bodies[0]!);
    f.change();
    const changed = await candidate.get(new Request("https://example.test/"));
    expect(changed.status).toBe(200);
    expect(await changed.text()).toContain("Changed title");
    expect(f.counts.texts).toBe(2);
    expect(f.counts.blocs).toBe(2);
    f.system.site.visible = false;
    expect((await candidate.get(new Request("https://example.test/"))).status).not.toBe(200);
    expect(f.counts.closed).toBe(f.counts.prepared);
});

test("failed deferred loads close their context and cannot poison the next cache fill", async () => {
    const f = fixture();
    const mounted = mountPublicPages({ repository: f.reader });
    f.fail(true);
    expect((await mounted.get(new Request("https://example.test/"))).status).toBe(500);
    await expect(f.captured()!.resource({}, "late", async () => 1)).rejects.toThrow("closed");
    f.fail(false);
    expect((await mounted.get(new Request("https://example.test/"))).status).toBe(200);
    expect(f.counts.closed).toBe(2);
});

test("a revision change between metadata and deferred payload retries once without caching mixed inputs", async () => {
    const f = fixture();
    const mounted = mountPublicPages({ repository: f.reader });
    f.onLoad(() => {
        f.change();
        f.onLoad(() => {});
    });
    const response = await mounted.get(new Request("https://example.test/"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Changed title");
    expect(f.counts.prepared).toBe(2);
    expect(f.counts.closed).toBe(2);
    expect((await mounted.get(new Request("https://example.test/"))).status).toBe(200);
    expect(f.counts.texts).toBe(2);
});

test("continuous rendering revision changes have a bounded retry and no cacheable result", async () => {
    const f = fixture();
    const mounted = mountPublicPages({ repository: f.reader });
    f.onLoad(f.change);
    const response = await mounted.get(new Request("https://example.test/"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(f.counts.prepared).toBe(2);
    expect(f.counts.closed).toBe(2);
});

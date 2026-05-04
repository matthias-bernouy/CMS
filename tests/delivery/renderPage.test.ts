import { describe, test, expect } from "bun:test";
import { renderPage } from "src/delivery/core/html/renderPage";
import { makeRuntimeRenderContext } from "src/delivery/core/html/runtimeContext";
import { makeDelivery, page, testRepository } from "./helpers";

async function renderToString(p: Parameters<typeof page>[0], opts: Parameters<typeof makeDelivery>[0] = {}) {
    const delivery = makeDelivery(opts);
    const entry = await renderPage(page(p), makeRuntimeRenderContext(delivery));
    return new TextDecoder().decode(entry.raw);
}

describe("renderPage — asset URLs respect cmsPathPrefix", () => {
    test("root runner: asset URLs sit under /.cms/*", async () => {
        const html = await renderToString(
            { content: `<my-card></my-card>` },
            {
                repository: testRepository({
                    blocs: [{ id: "my-card", name: "Card", group: "g", description: "" }],
                }),
            },
        );
        expect(html).toMatch(/href="\/\.cms\/style\?v=[a-f0-9]+"/);
        expect(html).toMatch(/src="\/\.cms\/assets\/component\.js\?v=[a-f0-9]+"/);
        expect(html).toMatch(/src="\/\.cms\/bloc\?tag=my-card&v=[a-f0-9]+"/);
        // Make sure legacy unprefixed URLs are NOT emitted.
        expect(html).not.toMatch(/href="\/style\?v=/);
        expect(html).not.toMatch(/src="\/bloc\?tag=/);
    });

    test("scoped runner: asset URLs include the tenant basePath", async () => {
        const html = await renderToString(
            { content: `<my-card></my-card>` },
            {
                basePath: "/tenant-1",
                repository: testRepository({
                    blocs: [{ id: "my-card", name: "Card", group: "g", description: "" }],
                }),
            },
        );
        expect(html).toMatch(/href="\/tenant-1\/\.cms\/style\?v=[a-f0-9]+"/);
        expect(html).toMatch(/src="\/tenant-1\/\.cms\/assets\/component\.js\?v=[a-f0-9]+"/);
        expect(html).toMatch(/src="\/tenant-1\/\.cms\/bloc\?tag=my-card&v=[a-f0-9]+"/);
    });

    test("default favicon fallback uses cmsPathPrefix", async () => {
        const html = await renderToString({}, { basePath: "/tenant-1" });
        expect(html).toContain('href="/tenant-1/.cms/assets/favicon"');
    });
});

describe("renderPage — identifier system is fully stripped", () => {
    test("canonical URL never includes ?identifier=", async () => {
        const html = await renderToString(
            { path: "/article" },
            {
                repository: testRepository({
                    settings: { host: "https://example.com" },
                }),
            },
        );
        expect(html).toContain('href="https://example.com/article"');
        expect(html).not.toContain("identifier=");
    });
});

describe("renderPage — meta", () => {
    test("emits title and description from the page", async () => {
        const html = await renderToString({ title: "T", description: "D" });
        expect(html).toContain("<title>T</title>");
        expect(html).toMatch(/<meta\b[^>]*\bname="description"[^>]*>/);
        expect(html).toMatch(/<meta\b[^>]*\bcontent="D"[^>]*>/);
    });

    test("charset + viewport + lang come from buildHtmlBasics", async () => {
        const html = await renderToString({}, {
            repository: testRepository({ settings: { language: "fr" } }),
        });
        expect(html).toMatch(/<html[^>]*\blang="fr"/);
        expect(html).toContain('charset="UTF-8"');
        expect(html).toContain('content="width=device-width, initial-scale=1.0"');
    });
});

describe("renderPage — body & bloc injection", () => {
    test("places expanded snippet content in the body", async () => {
        const html = await renderToString(
            { content: `<w13c-snippet identifier="hero">stale</w13c-snippet>` },
            {
                repository: testRepository({ snippets: { hero: "<h1>Live</h1>" } }),
            },
        );
        expect(html).toContain("<h1>Live</h1>");
        expect(html).not.toContain("stale");
    });

    test("only injects script tags for blocs actually used in the content", async () => {
        const html = await renderToString(
            { content: `<my-card></my-card>` },
            {
                repository: testRepository({
                    blocs: [
                        { id: "my-card", name: "Card",  group: "g", description: "" },
                        { id: "unused",  name: "Unused", group: "g", description: "" },
                    ],
                }),
            },
        );
        expect(html).toMatch(/src="\/\.cms\/bloc\?tag=my-card&v=/);
        expect(html).not.toContain("tag=unused");
    });
});

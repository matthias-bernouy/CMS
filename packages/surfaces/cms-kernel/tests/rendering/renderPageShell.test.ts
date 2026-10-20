import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import { renderPage } from "cms-kernel/html/renderPage";
import type { RenderContext } from "cms-kernel/html/RenderContext";
import type { ContentReader } from "@bernouy/cms-content";
import { type TPage, type TSystem } from "@bernouy/cms-content";

const BINDING_CORE_URL = "/.cms/assets/cms-binding-core.js?v=core";

function makeCtx(siteHost = ""): RenderContext {
    const system: TSystem = {
        initializationStep: 1,
        site: {
            name: "Site",
            favicon: "",
            visible: true,
            host: siteHost,
            language: "",
            theme: "",
            notFound: null,
            forbidden: null,
            serverError: null,
            login: null,
        },
        security: { connectExtras: [], mediaExtras: [] },
    };
    return {
        content: {
            getRenderingSettings: async () => system,
            getRenderableBlocs: async () => [],
        } as unknown as ContentReader,
        resolveAssets: async () => ({
            blocRuntimeUrl: "/.cms/assets/bloc-runtime.js?v=c",
            bindingCoreUrl: BINDING_CORE_URL,
            styleUrl: "/.cms/style?v=s",
            blocStyleUrls: ["/.cms/blocstyles?collection=example&tags=example-card&r=revision&v=css"],
            blocUrls: ["/.cms/blocs/example.js?v=b"],
            scriptUrls: ["/.cms/assets/bloc-runtime.js?v=c", "/.cms/blocs/example.js?v=b"],
        }),
        faviconUrl: "/favicon.ico",
    };
}

const page = {
    path: "/p",
    title: "T",
    description: "D",
    content: "<p>HELLO_BODY</p>",
    visible: true,
    tags: [],
} as unknown as TPage;

async function htmlOf(context = makeCtx()): Promise<string> {
    const entry = await renderPage(page, context);
    return new TextDecoder().decode(entry.raw);
}

describe("renderPage — binding core wrapper", () => {
    test("keeps the document boundary without loading the binding runtime for static content", async () => {
        const html = await htmlOf(makeCtx("https://example.test"));
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<cms-binding-core");
        expect(html).not.toContain(`<link href="${BINDING_CORE_URL}" as="script" rel="preload">`);
        expect(html).not.toContain('id="cms-binding-cloak"');
        expect(html).not.toContain("body{visibility:hidden}");
        expect(html).not.toContain(BINDING_CORE_URL);
        const { document } = parseHTML(html);
        expect(document.querySelector('script[type="application/ld+json"]')).not.toBeNull();
        expect(Array.from(document.querySelectorAll("script[src]"), (script) => script.getAttribute("src"))).toEqual([
            "/.cms/assets/bloc-runtime.js?v=c",
            "/.cms/blocs/example.js?v=b",
        ]);
    });

    test("loads and cloaks the binding runtime for live declarative content", async () => {
        const staticHtml = await htmlOf();
        const bound = await renderPage({ ...page, content: "<p>{{ state.title }}</p>" }, makeCtx());
        const output = new TextDecoder().decode(bound.raw);

        expect(staticHtml).not.toContain(BINDING_CORE_URL);
        expect(output).toContain(`<link href="${BINDING_CORE_URL}" as="script" rel="preload">`);
        expect(output).toContain('id="cms-binding-cloak"');
        expect(output).toContain(BINDING_CORE_URL);
    });

    test("passes transitive component dependencies without retaining the composition host", async () => {
        const ctx = makeCtx();
        const repository = ctx.content as unknown as {
            getRenderableBlocs: () => Promise<
                {
                    id: string;
                    kind: "component" | "composition";
                    markupHTML: string;
                    root: { accepts: ["div"] };
                    hasBehavior: boolean;
                }[]
            >;
            getBlocViewJS: (tag: string) => Promise<string | null>;
        };
        repository.getRenderableBlocs = async () => {
            return [
                {
                    id: "site-header",
                    kind: "composition",
                    markupHTML: '<nav cms-bloc="base-nav"></nav>',
                    root: { accepts: ["div"] },
                    hasBehavior: false,
                },
                {
                    id: "base-nav",
                    kind: "component",
                    markupHTML: '<a cms-bloc="base-link"></a>',
                    root: { accepts: ["div"] },
                    hasBehavior: false,
                },
                {
                    id: "base-link",
                    kind: "component",
                    markupHTML: "<slot></slot>",
                    root: { accepts: ["div"] },
                    hasBehavior: true,
                },
            ];
        };
        repository.getBlocViewJS = async (tag) =>
            ({
                "site-header": 'const t = `<nav cms-bloc="base-nav"></nav>`;',
                "base-nav": 'const t = `<a cms-bloc="base-link"></a>`;',
                "base-link": "LINK();",
            })[tag] ?? null;
        let resolvedTags: string[] = [];
        const resolveAssets = ctx.resolveAssets;
        ctx.resolveAssets = async (tags, blocs) => {
            resolvedTags = tags;
            return resolveAssets(tags, blocs);
        };

        await renderPage({ ...page, content: '<header cms-bloc="site-header"></header>' }, ctx);

        expect(resolvedTags).toEqual(["base-link", "base-nav"]);
    });

    test("makes dynamic image sources inert without changing static images", async () => {
        const entry = await renderPage(
            {
                ...page,
                content: `
                    <img data-kind="dynamic" src="/media/{{ product.image }}.jpg">
                    <img data-kind="static" src="/media/static.jpg">
                `,
            },
            makeCtx(),
        );
        const { document } = parseHTML(new TextDecoder().decode(entry.raw));
        const dynamicImage = document.querySelector('[data-kind="dynamic"]');
        const staticImage = document.querySelector('[data-kind="static"]');

        expect(dynamicImage?.getAttribute("src")).toBeNull();
        expect(dynamicImage?.getAttribute("data-cms-src")).toBe("/media/{{ product.image }}.jpg");
        expect(staticImage?.getAttribute("src")).toBe("/media/static.jpg");
        expect(staticImage?.getAttribute("data-cms-src")).toBeNull();
    });

    test("projects a concrete file reference into an image before serialization", async () => {
        const reference = JSON.stringify({
            url: "/.cms/call/ulvia.cms.files/files/file-1/generation-1",
            variants: [
                {
                    profile: "responsive",
                    width: 640,
                    url: "/.cms/call/ulvia.cms.files/files/file-1/generation-1/representations/responsive/640.webp",
                },
            ],
        });
        const entry = await renderPage(
            {
                ...page,
                content: `<figure cms-bloc="ulvia-official-image" file='${reference}' alt="Product"><img></figure>`,
            },
            makeCtx(),
        );
        const { document } = parseHTML(new TextDecoder().decode(entry.raw));
        const image = document.querySelector('[cms-bloc="ulvia-official-image"] > img');
        expect(image?.getAttribute("src")).toContain("/files/file-1/generation-1");
        expect(image?.getAttribute("srcset")).toContain("/representations/responsive/640.webp 640w");
        expect(image?.getAttribute("alt")).toBe("Product");
    });

    test("resolves platform metadata variables and an explicit noindex state", async () => {
        const ctx = makeCtx();
        const entry = await renderPage(
            {
                ...page,
                title: "${site.name} — ${page.path}",
                description: "Hosted by ${site.host}",
            },
            ctx,
            { indexable: false },
        );
        const { document } = parseHTML(new TextDecoder().decode(entry.raw));

        expect(document.title).toBe("Site — /p");
        expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("");
        expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
    });

    test("lets the runtime omit the enforcing CSP meta in development", async () => {
        const context = makeCtx();
        context.enforceCsp = false;
        const entry = await renderPage(page, context);
        const { document } = parseHTML(new TextDecoder().decode(entry.raw));

        expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')).toBeNull();
    });
});

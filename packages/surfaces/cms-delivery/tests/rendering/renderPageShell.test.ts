import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import type { ContentReader } from "@bernouy/cms-content";
import { type TPage, type TSystem } from "@bernouy/cms-content";

const BINDING_CORE_URL = "/.cms/assets/cms-binding-core.js?v=core";

function makeCtx(legacyEditor?: Record<string, unknown>): RenderContext {
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
        editor: { layoutCategory: "", ...legacyEditor },
        security: { connectExtras: [], mediaExtras: [] },
    };
    return {
        repository: {
            getSystem: async () => system,
            getBlocsList: async () => [],
        } as unknown as ContentReader,
        resolveAssets: async () => ({
            componentUrl: "/.cms/assets/component.js?v=c",
            bindingCoreUrl: BINDING_CORE_URL,
            styleUrl: "/.cms/style?v=s",
            blocUrls: [],
            scriptUrls: ["/.cms/assets/component.js?v=c"],
        }),
        faviconUrl: "/favicon.ico",
        headInjectors: [],
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

async function htmlOf(legacyEditor?: Record<string, unknown>): Promise<string> {
    const entry = await renderPage(page, makeCtx(legacyEditor));
    return new TextDecoder().decode(entry.raw);
}

describe("renderPage — binding core wrapper", () => {
    test("wraps content in <cms-binding-core> and injects the system-bloc script", async () => {
        const html = await htmlOf();
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<cms-binding-core");
        expect(html).toContain(`<link href="${BINDING_CORE_URL}" as="script" rel="preload">`);
        expect(html).toContain('id="cms-binding-cloak"');
        expect(html).toContain("[cms-source]:not([cms-ready]){visibility:hidden}");
        expect(html).toContain(BINDING_CORE_URL);
    });

    test("ignores legacy editor.shell values", async () => {
        const html = await htmlOf({ shell: "<header>HDR_X</header><main>{{CONTENT}}</main><footer>FTR_X</footer>" });
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<cms-binding-core");
        expect(html).not.toContain("HDR_X");
    });

    test("includes CSP origins declared by successful integration installations", async () => {
        const ctx = makeCtx();
        ctx.integrationInstallations = {
            list: async () => [
                {
                    id: "secure-embed",
                    status: "success",
                    definitionSnapshot: {
                        kind: "secure-embed",
                        label: "Secure Embed",
                        inputs: [],
                        security: {
                            csp: {
                                script: ["https://connect-js.stripe.com"],
                                frame: ["https://connect.stripe.com"],
                            },
                        },
                    },
                },
            ],
        } as RenderContext["integrationInstallations"];

        const entry = await renderPage(page, ctx);
        const html = new TextDecoder().decode(entry.raw);
        expect(html).toContain("script-src 'self' https://connect-js.stripe.com");
        expect(html).toContain("frame-src 'self' https://connect.stripe.com");
        expect(html).not.toContain("frame-ancestors");
    });

    test("passes transitive composition dependencies to asset resolution", async () => {
        const ctx = makeCtx();
        const repository = ctx.repository as unknown as {
            getBlocsList: () => Promise<{ id: string }[]>;
            getBlocViewJS: (tag: string) => Promise<string | null>;
        };
        repository.getBlocsList = async () => [{ id: "site-header" }, { id: "base-nav" }, { id: "base-link" }];
        repository.getBlocViewJS = async (tag) =>
            ({
                "site-header": "const t = `<base-nav></base-nav>`;",
                "base-nav": "const t = `<base-link></base-link>`;",
                "base-link": "LINK();",
            })[tag] ?? null;
        let resolvedTags: string[] = [];
        const resolveAssets = ctx.resolveAssets;
        ctx.resolveAssets = async (tags) => {
            resolvedTags = tags;
            return resolveAssets(tags);
        };

        await renderPage({ ...page, content: "<site-header></site-header>" }, ctx);

        expect(resolvedTags).toEqual(["base-link", "base-nav", "site-header"]);
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

    test("resolves platform metadata variables and an explicit noindex state", async () => {
        let injectedTitle = "";
        const ctx = makeCtx();
        ctx.headInjectors = [
            ({ metadata }) => {
                injectedTitle = metadata.title;
            },
        ];
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
        expect(injectedTitle).toBe("Site — /p");
    });
});

import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import type { ContentReader } from "@bernouy/cms-content";
import { type TPage, type TSystem } from "@bernouy/cms-content";

const BINDING_CORE_URL = "/.cms/assets/cms-binding-core.js?v=core";

function makeCtx(): RenderContext {
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
        security: { connectExtras: [], mediaExtras: [] },
    };
    return {
        repository: {
            getRenderingSettings: async () => system,
            getRenderableBlocs: async () => [],
        } as unknown as ContentReader,
        resolveAssets: async () => ({
            componentUrl: "/.cms/assets/component.js?v=c",
            bindingCoreUrl: BINDING_CORE_URL,
            styleUrl: "/.cms/style?v=s",
            blocUrls: ["/.cms/blocs/example.js?v=b"],
            scriptUrls: ["/.cms/assets/component.js?v=c", "/.cms/blocs/example.js?v=b"],
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

async function htmlOf(): Promise<string> {
    const entry = await renderPage(page, makeCtx());
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
        expect(html).not.toContain("body{visibility:hidden}");
        expect(html).toContain(BINDING_CORE_URL);
        const { document } = parseHTML(html);
        expect(Array.from(document.querySelectorAll("script[src]"), (script) => script.getAttribute("src"))).toEqual([
            "/.cms/assets/component.js?v=c",
            BINDING_CORE_URL,
            "/.cms/blocs/example.js?v=b",
        ]);
    });

    test("passes transitive composition dependencies to asset resolution", async () => {
        const ctx = makeCtx();
        const repository = ctx.repository as unknown as {
            getRenderableBlocs: () => Promise<{ id: string }[]>;
            getBlocViewJS: (tag: string) => Promise<string | null>;
        };
        repository.getRenderableBlocs = async () => {
            return [{ id: "site-header" }, { id: "base-nav" }, { id: "base-link" }];
        };
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
                content: `<ulvia-official-image file='${reference}' alt="Product"><img></ulvia-official-image>`,
            },
            makeCtx(),
        );
        const { document } = parseHTML(new TextDecoder().decode(entry.raw));
        const image = document.querySelector("ulvia-official-image > img");
        expect(image?.getAttribute("src")).toContain("/files/file-1/generation-1");
        expect(image?.getAttribute("srcset")).toContain("/representations/responsive/640.webp 640w");
        expect(image?.getAttribute("alt")).toBe("Product");
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

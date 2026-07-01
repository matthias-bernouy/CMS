import { describe, test, expect } from "bun:test";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import type { ContentReader } from "@bernouy/cms-content";
import { type TPage, type TSystem } from "@bernouy/cms-content";

const BINDING_CORE_URL = "/.cms/assets/cms-binding-core.js?v=core";

function makeCtx(legacyEditor?: Record<string, unknown>): RenderContext {
    const system: TSystem = {
        initializationStep: 1,
        site: { name: "Site", favicon: "", visible: true, host: "", language: "", theme: "", notFound: null, serverError: null },
        editor: { layoutCategory: "", ...legacyEditor },
        security: { connectExtras: [], mediaExtras: [] },
    };
    return {
        repository: {
            getSystem: async () => system,
            getBlocsList: async () => [],
        } as unknown as ContentReader,
        resolveAssets: async () => ({
            componentUrl:   "/.cms/assets/component.js?v=c",
            bindingCoreUrl: BINDING_CORE_URL,
            styleUrl:       "/.cms/style?v=s",
            blocUrls:       [],
            scriptUrls:     ["/.cms/assets/component.js?v=c"],
        }),
        defaultFaviconUrl: "/.cms/assets/favicon",
        headInjectors: [],
    };
}

const page = { path: "/p", title: "T", description: "D", content: "<p>HELLO_BODY</p>", visible: true, tags: [] } as unknown as TPage;

async function htmlOf(legacyEditor?: Record<string, unknown>): Promise<string> {
    const entry = await renderPage(page, makeCtx(legacyEditor));
    return new TextDecoder().decode(entry.raw);
}

describe("renderPage — binding core wrapper", () => {

    test("wraps content in <cms-binding-core> and injects the system-bloc script", async () => {
        const html = await htmlOf();
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<cms-binding-core");
        expect(html).toContain(BINDING_CORE_URL);
    });

    test("ignores legacy editor.shell values", async () => {
        const html = await htmlOf({ shell: "<header>HDR_X</header><main>{{CONTENT}}</main><footer>FTR_X</footer>" });
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<cms-binding-core");
        expect(html).not.toContain("HDR_X");
    });

});

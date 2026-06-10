import { describe, test, expect } from "bun:test";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import type { ContentReader } from "@bernouy/cms-content";
import { DEFAULT_SHELL, type TPage, type TSystem } from "@bernouy/cms-content";

const BINDING_CORE_URL = "/.cms/assets/cms-binding-core.js?v=core";

/** Minimal RenderContext whose system carries the given Shell. */
function makeCtx(shell: string): RenderContext {
    const system: TSystem = {
        initializationStep: 1,
        site: { name: "Site", favicon: "", visible: true, host: "", language: "", theme: "", notFound: null, serverError: null },
        editor: { layoutCategory: "", shell },
        security: { connectExtras: [], mediaExtras: [] },
        roles: { definitions: [] },
    };
    return {
        repository: {
            getSystem: async () => system,
            getBlocsList: async () => [],
            getSnippetByIdentifier: async () => null,
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

async function htmlOf(shell: string): Promise<string> {
    const entry = await renderPage(page, makeCtx(shell));
    return new TextDecoder().decode(entry.raw);
}

describe("renderPage — Shell composition", () => {

    test("default Shell wraps content in <cms-binding-core> and injects the system-bloc script", async () => {
        const html = await htmlOf(DEFAULT_SHELL);
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<cms-binding-core");
        expect(html).toContain(BINDING_CORE_URL);          // engine loaded because the page uses the core
    });

    test("a custom Shell composes around the content; without the core, the engine is NOT loaded (swappable)", async () => {
        const html = await htmlOf("<header>HDR_X</header><main>{{CONTENT}}</main><footer>FTR_X</footer>");
        expect(html).toContain("HDR_X");
        expect(html).toContain("FTR_X");
        expect(html).toContain("HELLO_BODY");
        expect(html).toContain("<main>");
        expect(html).not.toContain("<cms-binding-core");
        expect(html).not.toContain(BINDING_CORE_URL);      // no core tag → no binding runtime injected
    });

    test("a Shell missing the {{CONTENT}} marker falls back to the default — content is never dropped", async () => {
        const html = await htmlOf("<div>broken shell, no slot</div>");
        expect(html).toContain("HELLO_BODY");              // content preserved via fallback
        expect(html).toContain("<cms-binding-core");       // default Shell used
        expect(html).not.toContain("broken shell");
    });

});

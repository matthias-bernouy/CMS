import { expect, test } from "bun:test";
import { defaultSystem, type ContentReader, type PageRenderInputs, type TPage } from "@bernouy/cms-content";
import { mountPublicPages } from "../routing/publicPage.fixture";

test("each HTTP Page request consumes one aggregate snapshot and no legacy payload reads", async () => {
    const calls = new Map<string, number>();
    const count = (operation: string) => calls.set(operation, (calls.get(operation) ?? 0) + 1);
    const page = pageRecord();
    const inputs = pageRenderInputs(page);
    const content = contentReader(page, inputs, count);
    const mounted = mountPublicPages({
        repository: content,
        pageCapabilities: {
            requiredAccess: async () => {
                count("requiredAccess");
                return "public";
            },
        },
    });

    const responseBytes: number[] = [];
    for (let index = 0; index < 32; index += 1) {
        const response = await mounted.get(new Request("https://example.test/"));
        expect(response.status).toBe(200);
        responseBytes.push((await response.arrayBuffer()).byteLength);
    }

    expect(new Set(responseBytes).size).toBe(1);
    expect(Object.fromEntries([...calls].sort())).toEqual({
        getPageRenderInputs: 32,
    });
});

test("each request rechecks current capability access even when its Page snapshot is unchanged", async () => {
    const calls = new Map<string, number>();
    const count = (operation: string) => calls.set(operation, (calls.get(operation) ?? 0) + 1);
    const page = pageRecord('<section cms-query="catalog:list as items"></section>');
    const inputs = pageRenderInputs(page, [{ contractId: "catalog", capabilityId: "list", versionRange: "=1.0.0" }]);
    const mounted = mountPublicPages({
        repository: contentReader(page, inputs, count),
        pageCapabilities: {
            requiredAccess: async () => {
                count("requiredAccess");
                return "public";
            },
        },
    });

    for (let index = 0; index < 32; index += 1) {
        expect((await mounted.get(new Request("https://example.test/"))).status).toBe(200);
    }

    expect(Object.fromEntries([...calls].sort())).toEqual({
        getPageRenderInputs: 32,
        requiredAccess: 32,
    });
});

function contentReader(page: TPage, inputs: PageRenderInputs, count: (operation: string) => void): ContentReader {
    const renderable = inputs.route?.kind === "current" ? inputs.route.page : null;
    if (!renderable) {
        throw new TypeError("The fixture requires a current route");
    }
    const forbidden = (operation: string) => async (): Promise<never> => {
        count(operation);
        throw new Error(`Legacy render read was used: ${operation}`);
    };
    return {
        getPageRenderInputs: async () => {
            count("getPageRenderInputs");
            return inputs;
        },
        getRenderablePage: forbidden("getRenderablePage"),
        getRenderablePages: forbidden("getRenderablePages"),
        resolvePageReference: async () => null,
        resolvePagePaths: async () => ({}),
        resolveRenderableRoute: forbidden("resolveRenderableRoute"),
        getPublishedPage: async () => page,
        getPublishedPageById: async () => page,
        getPublishedPages: async () => {
            count("getPublishedPages");
            return [page];
        },
        resolvePublishedRoute: async () => null,
        getRenderableBlocs: forbidden("getRenderableBlocs"),
        getBlocViewJS: async () => null,
        getContentTexts: forbidden("getContentTexts"),
        getRenderingSettings: forbidden("getRenderingSettings"),
    };
}

function pageRenderInputs(
    page: TPage,
    requirements?: readonly { contractId: string; capabilityId: string; versionRange: string }[],
): PageRenderInputs {
    const settings = defaultSystem();
    settings.initializationStep = 1;
    settings.site.visible = true;
    const renderable = {
        reference: { kind: "site" as const, pageId: page.id },
        page,
        source: { kind: "site" as const, pageId: page.id, revision: page.revision },
        requirements: requirements ?? [],
    };
    return {
        route: { kind: "current", page: renderable, language: "en" },
        artifactRevision: "page-1",
        renderingRevision: "rendering-1",
        settings,
        contentTexts: [],
        renderableBlocs: [
            {
                id: "site-card",
                kind: "component",
                markupHTML: "<slot></slot>",
                root: { accepts: ["article"] },
                hasBehavior: false,
            },
        ],
    };
}

function pageRecord(content = '<article cms-bloc="site-card">Hello</article>'): TPage {
    return {
        id: "home",
        revision: 1,
        path: "/",
        title: "Home",
        description: "Home page",
        content,
        visible: true,
        tags: [],
    };
}

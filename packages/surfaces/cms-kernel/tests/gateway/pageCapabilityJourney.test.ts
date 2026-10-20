import { expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import {
    createContentReader,
    type CmsRepository,
    InMemoryCmsRepository,
    ValidatingCmsRepository,
} from "@bernouy/cms-content";
import type { GatewayInvocation, GatewayInvoker } from "@bernouy/cms-gateway";
import { PageCapabilityAnalyzer } from "@bernouy/cms-gateway/analysis";
import { InMemoryCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import { NOOP_LOGGER } from "@bernouy/logging";
import { CaptureRunner } from "./support/CaptureRunner";

test("a published Page is analyzed statically and invokes its public capability without a Page grant", async () => {
    const repository: CmsRepository = new ValidatingCmsRepository(new InMemoryCmsRepository());
    await repository.createBloc({
        id: "catalog-products",
        name: "Product catalogue",
        group: "catalogue",
        description: "Displays products returned by the catalogue provider.",
        viewJS: "cmsRuntime.registerBloc('catalog-products', { mount() {} })",
        root: { accepts: ["div"] },
        kind: "component" as const,
        markupHTML:
            '<section cms-query="shop:list-products as products" cms-query-input=\'{"category":{"from":"literal","value":"shoes"}}\'></section>',
        ownership: { kind: "code-managed" },
        slots: {},
    });
    await repository.insertPage("/products", "Products", '<div cms-bloc="catalog-products"></div>');
    const draft = await repository.getPage("/products");
    await repository.updatePage({ id: draft!.id, visible: true }, draft!.revision);
    repository.getPageRequirements = async () => [
        { contractId: "shop", capabilityId: "list-products", versionRange: "=2.3.0" },
    ];

    const invocations: GatewayInvocation[] = [];
    const invoker = catalogueInvoker(invocations);
    const pageCapabilities = new PageCapabilityAnalyzer({
        resolveCapability: async (contractId, capabilityId) =>
            contractId === "shop" && capabilityId === "list-products" ? { access: "public", version: "2.3.0" } : null,
    });
    const runner = new CaptureRunner();
    new KernelCms({
        runner,
        content: createContentReader(repository),
        authentication: new InMemoryAuthentication(),
        cache: new InMemoryCache(),
        capabilityGateway: {
            siteId: "site-a",
            invoker,
            isAdministrator: async () => false,
            resolveCapability: async () => ({ access: "public", effect: "query", outputType: "object" }),
        },
        pageCapabilities,
        logger: NOOP_LOGGER,
    });

    const pageResponse = await runner.defaultHandler("GET", "/")(new Request("https://site.test/products"));
    const html = await pageResponse.text();
    expect(pageResponse.status).toBe(200);
    expect(html).toContain('cms-bloc="catalog-products"');
    expect(html).toContain("shop:list-products as products");
    expect(html).toContain("/.cms/assets/bloc-runtime.js?v=");

    const callResponse = await runner.defaultHandler(
        "QUERY",
        "/.cms/query",
    )(
        new Request("https://site.test/.cms/query/shop/list-products", {
            method: "QUERY",
            headers: { "content-type": "application/json" },
            body: '{"category":"shoes"}',
        }),
    );
    expect(callResponse.status).toBe(200);
    expect(await callResponse.json()).toEqual({ items: [{ id: "shoe-1" }] });
    expect(invocations).toEqual([
        {
            siteId: "site-a",
            contractId: "shop",
            capabilityId: "list-products",
            input: { category: "shoes" },
            actor: { kind: "anonymous" },
        },
    ]);
});

function catalogueInvoker(invocations: GatewayInvocation[]): GatewayInvoker {
    return {
        resolveHttp: async () =>
            ({
                capability: {
                    id: "list-products",
                    input: {
                        type: "object",
                        properties: { category: { type: "string", maxLength: 50 } },
                        required: [],
                    },
                },
                binding: {
                    method: "POST",
                    path: "/products",
                    pathParameters: [],
                    query: [],
                    headers: [],
                    body: { kind: "json", properties: ["category"], contentTypes: ["application/json"] },
                },
                pathValues: {},
            }) as never,
        invoke: async (invocation) => {
            invocations.push(invocation);
            return {
                kind: "success",
                status: 200,
                requestId: "request-1",
                output: { items: [{ id: "shoe-1" }] },
            };
        },
    };
}

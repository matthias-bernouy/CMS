import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import type { GatewayHttpInvoker } from "@bernouy/cms-gateway/http";
import { queryContract } from "../support/queryContract";
import { expect, test } from "bun:test";
import {
    createContentReader,
    type ContentRepository,
    InMemoryContentRepository,
    ValidatingContentRepository,
} from "@bernouy/cms-content";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { PageCapabilityAnalyzer } from "@bernouy/cms-content/public-delivery";
import { InMemoryCache } from "@bernouy/http-runner";
import EdgeCms from "../support/ContentHarness";
import { NOOP_LOGGER } from "@bernouy/logging";
import { CaptureRunner } from "../support/CaptureRunner";

test("a published Page is analyzed statically and invokes its public capability without a Page grant", async () => {
    const repository: ContentRepository = new ValidatingContentRepository(new InMemoryContentRepository());
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
        satisfiesVersionRange,
        resolveCapability: async (contractId, capabilityId) =>
            contractId === "shop" && capabilityId === "list-products" ? { access: "public", version: "2.3.0" } : null,
    });
    const runner = new CaptureRunner();
    const content = createContentReader(repository);
    new EdgeCms({
        runner,
        content,
        resolveActor: async () => ({ kind: "anonymous" }),
        cache: new InMemoryCache(),
        capabilityGateway: {
            siteId: "site-a",
            invoker,
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
    expect(html).toContain("/_content/assets/bloc-runtime.js?v=");

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
            bindingId: "http",
            bindingTransport: "http",
            actor: { kind: "anonymous" },
        },
    ]);
});

function catalogueInvoker(invocations: GatewayInvocation[]): GatewayHttpInvoker {
    return {
        resolveContract: queryContract,
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

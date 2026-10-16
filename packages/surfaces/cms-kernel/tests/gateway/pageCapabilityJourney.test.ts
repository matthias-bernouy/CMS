import { expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import {
    createContentReader,
    type CmsRepository,
    InMemoryCmsRepository,
    ValidatingCmsRepository,
} from "@bernouy/cms-content";
import type { GatewayInvocation, GatewayInvoker } from "@bernouy/cms-gateway";
import { PageExecutionService, type PageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { InMemoryCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "./support/CaptureRunner";

test("a published Page renders and invokes only its exact capability plan", async () => {
    const repository: CmsRepository = new ValidatingCmsRepository(new InMemoryCmsRepository());
    await repository.createBloc({
        id: "catalog-products",
        name: "Product catalogue",
        group: "catalogue",
        description: "Displays products returned by the catalogue provider.",
        viewJS: "cmsRuntime.registerBloc('catalog-products', { mount() {} })",
        root: { accepts: ["div"] },
        templateHTML:
            '<section cms-query="shop:list-products as products" cms-query-input=\'{"category":{"from":"literal","value":"shoes"}}\'></section>',
        ownership: { kind: "code-managed" },
        slots: {},
    });
    await repository.insertPage("/products", "Products", '<div cms-bloc="catalog-products"></div>');
    const draft = await repository.getPage("/products");
    const published = await repository.updatePage({ id: draft!.id, visible: true }, draft!.revision);
    repository.getPageRequirements = async () => [
        { contractId: "shop", capabilityId: "list-products", versionRange: "=2.3.0" },
    ];

    const activations: Parameters<PageExecutionAuthority["activate"]>[0][] = [];
    const authorizations: Parameters<PageExecutionAuthority["authorize"]>[0][] = [];
    const invocations: GatewayInvocation[] = [];
    const authority = captureAuthority(activations, authorizations);
    const invoker = catalogueInvoker(invocations);
    const pageExecution = new PageExecutionService({
        siteId: "site-a",
        content: createContentReader(repository),
        authority,
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
            resolveCapability: async () => ({ effect: "query", outputType: "object" }),
        },
        pageExecution,
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
            headers: { "content-type": "application/json", referer: "https://site.test/products" },
            body: '{"category":"shoes"}',
        }),
    );
    expect(callResponse.status).toBe(200);
    expect(await callResponse.json()).toEqual({ items: [{ id: "shoe-1" }] });
    expect(activations).toEqual([
        {
            consumer: { kind: "site", siteId: "site-a", pageId: published!.id, pageRevision: published!.revision },
            requirements: [{ contractId: "shop", capabilityId: "list-products", versionRange: "=2.3.0" }],
        },
    ]);
    expect(authorizations).toEqual([
        {
            kind: "site",
            siteId: "site-a",
            pageId: published!.id,
            pageRevision: published!.revision,
            contractId: "shop",
            capabilityId: "list-products",
        },
    ]);
    expect(invocations).toEqual([
        {
            siteId: "site-a",
            contractId: "shop",
            capabilityId: "list-products",
            input: { category: "shoes" },
            origin: "page",
            actor: { kind: "user", subjectId: "dev-user" },
            execution: {
                planDigest: "sha256:page-plan",
                version: "2.3.0",
                digest: "sha256:provider-release",
                installationId: "shop-provider",
            },
        },
    ]);
});

function captureAuthority(
    activations: Parameters<PageExecutionAuthority["activate"]>[0][],
    authorizations: Parameters<PageExecutionAuthority["authorize"]>[0][],
): PageExecutionAuthority {
    return {
        activate: async (input) => {
            activations.push(input);
            return {} as never;
        },
        authorize: async (input) => {
            authorizations.push(input);
            return {
                planDigest: "sha256:page-plan",
                version: "2.3.0",
                digest: "sha256:provider-release",
                installationId: "shop-provider",
            };
        },
    };
}

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

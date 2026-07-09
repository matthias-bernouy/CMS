import {
    executeFunctionSystemSourceEndpoint,
    InMemoryFunctionRepository,
    withFunctionsSource,
    type CmsFunction,
} from "@bernouy/cms-functions";
import {
    handleSourceRequest,
    makeEndpointUrn,
    makeSourceUrn,
    type DataShape,
    type InMemorySourceRepository,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

export const prefix = "/.cms/sources/";

export async function proxyFunction(
    sources: InMemorySourceRepository,
    functions: InMemoryFunctionRepository,
    options: { user: { id: string; role: string }; fetchImpl: typeof fetch },
): Promise<Response> {
    const proxiedSources = withFunctionsSource(sources, functions);
    const url = new URL(`${prefix}system-functions/updateMyProduct`, "https://cms.test");
    return handleSourceRequest(proxiedSources, new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: "p1", title: "New title" }),
    }), {
        prefix,
        deps: {
            authorizeEndpoint: () => true,
            executeSystemEndpoint: (endpoint, request) => executeFunctionSystemSourceEndpoint(endpoint, request, {
                functions,
                sources,
                deps: { fetchImpl: options.fetchImpl },
                resolveUser: async () => options.user,
            }),
        },
    });
}

export function updateMyProductFunction(): CmsFunction {
    return {
        id: "updateMyProduct",
        method: "POST",
        input: {
            body: {
                type: "object",
                properties: { productId: { type: "string" }, title: { type: "string" } },
                required: ["productId", "title"],
            },
        },
        steps: [
            {
                id: "product",
                call: {
                    source: "products",
                    endpoint: "getProduct",
                    params: { productId: "$input.body.productId" },
                },
            },
            {
                assert: {
                    condition: { equals: ["$steps.product.ownerUserId", "$ctx.user.id"] },
                    failure: { status: 403, error: "Not your product" },
                },
            },
            {
                id: "updated",
                call: {
                    source: "products",
                    endpoint: "updateProduct",
                    params: { productId: "$input.body.productId" },
                    body: { title: "$input.body.title" },
                },
            },
        ],
        return: { status: 200, body: "$steps.updated" },
    };
}

export function productsSource(): Source {
    return {
        urn: makeSourceUrn("products"),
        meta: { name: "Products" },
        endpoints: [
            {
                urn: makeEndpointUrn("products", "listProducts"),
                method: "GET",
                targetUrl: "https://api.test/products/list",
                input: { params: [] },
                output: [{
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            items: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } },
                        },
                    },
                }],
            },
            endpoint("getProduct", "GET", "https://api.test/products"),
            endpoint("updateProduct", "POST", "https://api.test/products/update", {
                body: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
            }),
        ],
    };
}

function endpoint(id: string, method: "GET" | "POST", targetUrl: string, options: { body?: DataShape } = {}): SourceEndpoint {
    return {
        urn: makeEndpointUrn("products", id),
        method,
        targetUrl,
        input: {
            params: [{ name: "productId", in: "query", required: true, schema: { type: "string" } }],
            ...(options.body ? { body: options.body } : {}),
        },
        output: [{
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    ownerUserId: { type: "string" },
                    title: { type: "string" },
                },
            },
        }],
    };
}

export function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

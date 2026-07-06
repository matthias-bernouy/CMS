import { describe, expect, test } from "bun:test";
import {
    executeFunctionSystemSourceEndpoint,
    InMemoryFunctionRepository,
    validateFunction,
    withFunctionsSource,
    type CmsFunction,
} from "@bernouy/cms-functions";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type DataShape,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

const prefix = "/.cms/sources/";

describe("cms functions", () => {
    test("projects and executes a function as a system source endpoint", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(updateMyProductFunction());
        const requests: Request[] = [];

        const response = await proxyFunction(sources, functions, {
            user: { id: "user-1", role: "seller" },
            fetchImpl: async (input, init) => {
                const request = input instanceof Request ? input : new Request(input, init);
                requests.push(request);
                const url = new URL(request.url);
                if (request.method === "GET" && url.pathname === "/products") {
                    return json({ id: "p1", ownerUserId: "user-1", title: "Old" });
                }
                if (request.method === "POST" && url.pathname === "/products/update") {
                    return json({ id: "p1", ownerUserId: "user-1", title: (await request.json()).title });
                }
                return new Response("not found", { status: 404 });
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: "p1", ownerUserId: "user-1", title: "New title" });
        expect(requests.map(request => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
            "GET /products",
            "POST /products/update",
        ]);
    });

    test("stops before privileged calls when an assert fails", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(updateMyProductFunction());
        const requests: string[] = [];

        const response = await proxyFunction(sources, functions, {
            user: { id: "user-2", role: "seller" },
            fetchImpl: async (input, init) => {
                const request = input instanceof Request ? input : new Request(input, init);
                requests.push(`${request.method} ${new URL(request.url).pathname}`);
                return json({ id: "p1", ownerUserId: "user-1", title: "Old" });
            },
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Not your product" });
        expect(requests).toEqual(["GET /products"]);
    });

    test("validates source references and GET purity", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const fn = updateMyProductFunction();
        fn.method = "GET";

        expect(await validateFunction(fn, { sources })).toEqual(expect.arrayContaining([
            "function.steps.2.call cannot call POST from a GET function",
        ]));
    });
});

async function proxyFunction(
    sources: InMemorySourceRepository,
    functions: InMemoryFunctionRepository,
    options: {
        user: { id: string; role: string };
        fetchImpl: typeof fetch;
    },
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

function updateMyProductFunction(): CmsFunction {
    return {
        id: "updateMyProduct",
        method: "POST",
        input: {
            body: {
                type: "object",
                properties: {
                    productId: { type: "string" },
                    title: { type: "string" },
                },
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

function productsSource(): Source {
    return {
        urn: makeSourceUrn("products"),
        meta: { name: "Products" },
        endpoints: [
            endpoint("getProduct", "GET", "https://api.test/products"),
            endpoint("updateProduct", "POST", "https://api.test/products/update", {
                body: {
                    type: "object",
                    properties: { title: { type: "string" } },
                    required: ["title"],
                },
            }),
        ],
    };
}

function endpoint(
    id: string,
    method: "GET" | "POST",
    targetUrl: string,
    options: { body?: DataShape } = {},
): SourceEndpoint {
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

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

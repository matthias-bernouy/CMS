import { describe, expect, test } from "bun:test";
import {
    executeFunction,
    validateFunction,
    type CmsFunction,
} from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { json, productsSource } from "./helpers/functionFixtures";

describe("cms functions foreach", () => {
    test("executes loops with item and index bindings", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const requests: string[] = [];
        const fn = loadProductsFunction();

        expect(await validateFunction(fn, { sources })).toEqual([]);
        const response = await executeFunction(fn, new Request("https://cms.test/function"), {
            sources,
            deps: {
                fetchImpl: async (input, init) => {
                    const request = input instanceof Request ? input : new Request(input, init);
                    const url = new URL(request.url);
                    requests.push(`${request.method} ${url.pathname}${url.search}`);
                    if (url.pathname === "/products/list") return json({ items: [{ id: "p1" }, { id: "p2" }] });
                    return json({
                        id: url.searchParams.get("productId"),
                        ownerUserId: "user-1",
                        title: `Product ${url.searchParams.get("productId")}`,
                    });
                },
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
            { index: 0, itemId: "p1", product: { id: "p1", ownerUserId: "user-1", title: "Product p1" } },
            { index: 1, itemId: "p2", product: { id: "p2", ownerUserId: "user-1", title: "Product p2" } },
        ]);
        expect(requests).toEqual([
            "GET /products/list",
            "GET /products?productId=p1",
            "GET /products?productId=p2",
        ]);
    });

    test("validates scopes and static call budget", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());

        expect(await validateFunction(itemOutsideLoop(), { sources }))
            .toContain('function.steps.0.call has an invalid reference "$item.id"');
        expect(await validateFunction(nestedLoop(), { sources }))
            .toContain("function.steps.0.forEach.steps.0.forEach must not be nested");
        expect(await validateFunction(tooManyCalls(), { sources }))
            .toContain("function call budget exceeds max (51, max 50)");
        expect(await validateFunction(continuingLoop(16), { sources })).toEqual([]);
        expect(await validateFunction(continuingLoop(17), { sources }))
            .toContain("function call budget exceeds max (51, max 50)");
    });

    test("fails fast when runtime items exceed max", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const response = await executeFunction(limitedFunction(), new Request("https://cms.test/function"), {
            sources,
            deps: { fetchImpl: async () => json({ items: [{ id: "p1" }, { id: "p2" }] }) },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'forEach "loop" exceeds max items' });
    });

    test("does not swallow programming errors when continueOnError is enabled", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const originalGetEndpoint = sources.getEndpoint.bind(sources);
        let endpointLookups = 0;
        let fetchCalls = 0;
        sources.getEndpoint = async urn => {
            endpointLookups += 1;
            if (endpointLookups === 1) throw new Error("repository programming bug");
            return await originalGetEndpoint(urn);
        };
        const fn: CmsFunction = {
            id: "strictLoopErrors",
            method: "GET",
            steps: [{
                id: "loop",
                forEach: {
                    items: [{ id: "p1" }],
                    max: 1,
                    continueOnError: true,
                    steps: [{ id: "product", call: productCall() }],
                    onError: [{ id: "markFailure", call: productCall() }],
                },
            }],
            return: { body: "$steps.loop" },
        };

        const response = await executeFunction(fn, new Request("https://cms.test/function"), {
            sources,
            deps: { fetchImpl: async () => { fetchCalls += 1; return json({}); } },
        });

        expect(response.status).toBe(500);
        expect(endpointLookups).toBe(1);
        expect(fetchCalls).toBe(0);
    });
});

function loadProductsFunction(): CmsFunction {
    return {
        id: "loadProducts",
        method: "GET",
        steps: [
            { id: "list", call: { source: "products", endpoint: "listProducts" } },
            {
                id: "details",
                forEach: {
                    items: "$steps.list.items",
                    max: 5,
                    steps: [{ id: "detail", call: productCall() }],
                    yield: { index: "$index", itemId: "$item.id", product: "$steps.detail" },
                },
            },
        ],
        return: { body: "$steps.details" },
    };
}

function itemOutsideLoop(): CmsFunction {
    return { id: "badItem", method: "GET", steps: [{ id: "product", call: productCall() }], return: { body: "$steps.product" } };
}

function nestedLoop(): CmsFunction {
    return {
        id: "nested",
        method: "GET",
        steps: [{
            id: "outer",
            forEach: {
                items: [{ id: "p1" }],
                max: 1,
                steps: [{ id: "inner", forEach: { items: [{ id: "p2" }], max: 1, steps: [{ id: "product", call: productCall() }] } }],
            },
        }],
        return: { body: "$steps.outer" },
    };
}

function tooManyCalls(): CmsFunction {
    return {
        id: "tooMany",
        method: "GET",
        steps: [
            { id: "list", call: { source: "products", endpoint: "listProducts" } },
            { id: "loop", forEach: { items: "$steps.list.items", max: 50, steps: [{ id: "product", call: productCall() }] } },
        ],
        return: { body: "$steps.loop" },
    };
}

function limitedFunction(): CmsFunction {
    const fn = tooManyCalls();
    fn.id = "limited";
    (fn.steps[1] as Extract<CmsFunction["steps"][number], { forEach: unknown }>).forEach.max = 1;
    return fn;
}

function continuingLoop(max: number): CmsFunction {
    return {
        id: `continuingLoop${max}`,
        method: "GET",
        steps: [{
            id: "loop",
            forEach: {
                items: [{ id: "p1" }],
                max,
                continueOnError: true,
                steps: [
                    { id: "firstCall", call: productCall() },
                    { id: "lastCall", call: productCall() },
                ],
                onError: [{ id: "markFailure", call: productCall() }],
            },
        }],
        return: { body: "$steps.loop" },
    };
}

function productCall() {
    return { source: "products", endpoint: "getProduct", params: { productId: "$item.id" } };
}

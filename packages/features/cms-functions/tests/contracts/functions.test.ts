import { describe, expect, test } from "bun:test";
import {
    executeFunction,
    functionAsEndpoint,
    InMemoryFunctionRepository,
    resolveFunctionValue,
    validateFunction,
} from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { json, productsSource, proxyFunction, updateMyProductFunction } from "../helpers/functionFixtures";

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
        expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
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

        expect(await validateFunction(fn, { sources })).toEqual(
            expect.arrayContaining(["function.steps.2.call cannot call POST from a GET function"]),
        );
    });

    test("projects function access onto the system source endpoint", () => {
        const fn = updateMyProductFunction();
        fn.access = { mode: "admin" };

        expect(functionAsEndpoint(fn).access).toEqual({ mode: "admin" });
    });

    test("resolves concat expressions", () => {
        expect(
            resolveFunctionValue(
                {
                    $concat: ["campaign-", "$input.body.id", ":", "$item.email"],
                },
                {
                    input: { body: { id: "weekly" } },
                    item: { email: "ada@example.test" },
                },
            ),
        ).toBe("campaign-weekly:ada@example.test");
    });

    test("does not expose source error details without a declared function output", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(productsSource());
        const fetchImpl = async () => json({ error: "template key is missing" }, 400);

        const hidden = await executeFunction(updateMyProductFunction(), updateRequest(), {
            sources,
            user: { id: "user-1", role: "seller" },
            deps: { fetchImpl },
        });
        expect(hidden.status).toBe(502);
        expect(await hidden.json()).toEqual({
            error: "Function execution failed",
            correlationId: hidden.headers.get("x-correlation-id"),
        });

        const detailed = await executeFunction(updateMyProductFunction(), updateRequest(), {
            sources,
            user: { id: "user-1", role: "seller" },
            deps: { fetchImpl },
            includeCallErrorDetails: true,
        });
        expect(detailed.status).toBe(502);
        expect(await detailed.json()).toEqual({
            error: "Function execution failed",
            correlationId: detailed.headers.get("x-correlation-id"),
        });
    });
});

function updateRequest(): Request {
    return new Request("https://cms.test/function", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: "p1", title: "New title" }),
    });
}

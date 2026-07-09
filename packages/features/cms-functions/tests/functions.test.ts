import { describe, expect, test } from "bun:test";
import {
    functionAsEndpoint,
    InMemoryFunctionRepository,
    validateFunction,
} from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    json,
    productsSource,
    proxyFunction,
    updateMyProductFunction,
} from "./helpers/functionFixtures";

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

    test("projects function access onto the system source endpoint", () => {
        const fn = updateMyProductFunction();
        fn.access = { mode: "auth" };

        expect(functionAsEndpoint(fn).access).toEqual({ mode: "auth" });
    });
});

import { describe, expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    functionRequest,
    productCall,
    productSources,
    recoveringProductsFunction,
    recoveryLoop,
    requestProductId,
} from "./helpers/foreachRecoveryFixtures";
import { expectCorrelatedFunctionFailure, json } from "./helpers/functionFixtures";

describe("cms functions foreach recovery", () => {
    test("recovers one item without exposing its provider failure", async () => {
        const sources = await productSources();
        const requests: string[] = [];
        const response = await executeFunction(recoveringProductsFunction(), functionRequest(), {
            sources,
            includeCallErrorDetails: true,
            deps: {
                fetchImpl: async (input) => {
                    const id = requestProductId(input);
                    requests.push(id);
                    if (id === "p1") {
                        return json({ error: "private provider failure", email: "private@example.test" }, 503);
                    }
                    return json({ id, ownerUserId: "user-1", title: `Product ${id}` });
                },
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
            { itemId: "p1", failed: true, recoveryId: "r1" },
            { itemId: "p2", failed: false, productId: "p2" },
        ]);
        expect(requests).toEqual(["p1", "r1", "p2"]);
    });

    test("preserves fail-fast behavior when recovery is not enabled", async () => {
        const sources = await productSources();
        const fn = recoveringProductsFunction();
        const loop = recoveryLoop(fn);
        delete loop.continueOnError;
        delete loop.onError;
        delete loop.errorYield;
        const requests: string[] = [];

        const response = await executeFunction(fn, functionRequest(), {
            sources,
            deps: {
                fetchImpl: async (input) => {
                    requests.push(requestProductId(input));
                    return json({ error: "failed" }, 503);
                },
            },
        });

        expect(response.status).toBe(502);
        expect(requests).toEqual(["p1"]);
    });

    test("returns an empty result without running either branch", async () => {
        const sources = await productSources();
        let calls = 0;
        const response = await executeFunction(recoveringProductsFunction([]), functionRequest(), {
            sources,
            deps: {
                fetchImpl: async () => {
                    calls += 1;
                    return json({});
                },
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([]);
        expect(calls).toBe(0);
    });

    test("recovers declarative assertion failures per item", async () => {
        const sources = await productSources();
        const fn = recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]);
        const loop = recoveryLoop(fn);
        loop.steps = [
            {
                assert: {
                    condition: { equals: ["$item.id", "allowed"] },
                    failure: { status: 409, error: "Item rejected" },
                },
            },
        ];
        loop.onError = [{ assert: { condition: { exists: "$item.id" } } }];
        loop.errorYield = { itemId: "$item.id", failed: true };

        const response = await executeFunction(fn, functionRequest(), { sources });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{ itemId: "p1", failed: true }]);
    });

    test("stops globally when the recovery branch fails", async () => {
        const sources = await productSources();
        const requests: string[] = [];
        const response = await executeFunction(recoveringProductsFunction(), functionRequest(), {
            sources,
            deps: {
                fetchImpl: async (input) => {
                    requests.push(requestProductId(input));
                    return json({ error: "failed" }, 503);
                },
            },
        });

        expect(response.status).toBe(502);
        expect(requests).toEqual(["p1", "r1"]);
    });

    test("does not turn unexpected repository errors into item failures", async () => {
        const sources = await productSources();
        let lookups = 0;
        let calls = 0;
        sources.getEndpoint = async () => {
            lookups += 1;
            throw new Error("repository programming error");
        };

        const response = await executeFunction(recoveringProductsFunction(), functionRequest(), {
            sources,
            deps: {
                fetchImpl: async () => {
                    calls += 1;
                    return json({});
                },
            },
        });

        await expectCorrelatedFunctionFailure(response);
        expect(lookups).toBe(1);
        expect(calls).toBe(0);
    });

    test("does not recover missing endpoint configuration", async () => {
        const fn = recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]);
        const loop = recoveryLoop(fn);
        loop.onError = [{ assert: { condition: { exists: "$item" } } }];
        loop.errorYield = { failed: true };

        const response = await executeFunction(fn, functionRequest(), {
            sources: new InMemorySourceRepository(),
        });

        await expectCorrelatedFunctionFailure(response);
    });

    test("does not recover the global call budget", async () => {
        const sources = await productSources();
        const items = Array.from({ length: 26 }, (_, index) => ({ id: `p${index}`, recoveryId: `r${index}` }));
        const fn = recoveringProductsFunction(items);
        const loop = recoveryLoop(fn);
        loop.max = 50;
        loop.steps = [
            { id: "first", call: productCall("$item.id") },
            { id: "second", call: productCall("$item.id") },
        ];
        loop.onError = [{ assert: { condition: { exists: "$item" } } }];
        let calls = 0;

        const response = await executeFunction(fn, functionRequest(), {
            sources,
            deps: {
                fetchImpl: async (input) => {
                    calls += 1;
                    const id = requestProductId(input);
                    return json({ id, ownerUserId: "user-1", title: `Product ${id}` });
                },
            },
        });

        await expectCorrelatedFunctionFailure(response);
        expect(calls).toBe(50);
    });
});

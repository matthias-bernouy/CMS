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
} from "../helpers/foreachRecoveryFixtures";
import { expectCorrelatedFunctionFailure, json } from "../helpers/functionFixtures";

describe("cms functions foreach recovery failures", () => {
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
        const definition = recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]);
        const loop = recoveryLoop(definition);
        loop.onError = [{ assert: { condition: { exists: "$item" } } }];
        loop.errorYield = { failed: true };
        const response = await executeFunction(definition, functionRequest(), {
            sources: new InMemorySourceRepository(),
        });
        await expectCorrelatedFunctionFailure(response);
    });

    test("does not recover the global call budget", async () => {
        const sources = await productSources();
        const items = Array.from({ length: 26 }, (_, index) => ({ id: `p${index}`, recoveryId: `r${index}` }));
        const definition = recoveringProductsFunction(items);
        const loop = recoveryLoop(definition);
        loop.max = 50;
        loop.steps = [
            { id: "first", call: productCall("$item.id") },
            { id: "second", call: productCall("$item.id") },
        ];
        loop.onError = [{ assert: { condition: { exists: "$item" } } }];
        let calls = 0;
        const response = await executeFunction(definition, functionRequest(), {
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

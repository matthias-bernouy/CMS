import { describe, expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import {
    functionRequest,
    productSources,
    recoveringProductsFunction,
    recoveryLoop,
    requestProductId,
} from "./helpers/foreachRecoveryFixtures";
import { expectCorrelatedFunctionFailure, json } from "./helpers/functionFixtures";

describe("cms functions foreach recovery bounds", () => {
    test("rejects an oversized loop even when validation was bypassed", async () => {
        const sources = await productSources();
        const fn = recoveringProductsFunction([]);
        recoveryLoop(fn).max = 51;
        let calls = 0;

        const response = await executeFunction(fn, functionRequest(), {
            sources,
            deps: {
                fetchImpl: async () => {
                    calls += 1;
                    return json({});
                },
            },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: 'forEach "loop" max must be an integer between 1 and 50',
        });
        expect(calls).toBe(0);
    });

    test("applies the response-size bound to recovery calls", async () => {
        const sources = await productSources();
        const requests: string[] = [];
        const response = await executeFunction(
            recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]),
            functionRequest(),
            {
                sources,
                maxResponseBytes: 8,
                deps: {
                    fetchImpl: async (input) => {
                        const id = requestProductId(input);
                        requests.push(id);
                        if (id === "p1") {
                            return json({ error: "failed" }, 503);
                        }
                        return json({ id, title: "oversized recovery response" });
                    },
                },
            },
        );

        expect(response.status).toBe(500);
        expect(requests).toEqual(["p1", "r1"]);
    });

    test("measures recovery call limits in UTF-8 bytes", async () => {
        const sources = await productSources({ passthroughProductResponses: true });
        const requests: string[] = [];
        const response = await executeFunction(
            recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]),
            functionRequest(),
            {
                sources,
                maxResponseBytes: 6,
                deps: {
                    fetchImpl: async (input) => {
                        const id = requestProductId(input);
                        requests.push(id);
                        return id === "p1" ? json({ error: "failed" }, 503) : json("ééé");
                    },
                },
            },
        );

        expect(response.status).toBe(500);
        expect(requests).toEqual(["p1", "r1"]);
    });

    test("cancels oversized success and ignored error response streams", async () => {
        const cancelled: number[] = [];
        for (const status of [200, 503]) {
            const sources = await productSources({ passthroughProductResponses: true });
            const fn = recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]);
            const loop = recoveryLoop(fn);
            loop.onError = [{ assert: { condition: { exists: "$item" } } }];
            loop.errorYield = null;
            const response = await executeFunction(fn, functionRequest(), {
                sources,
                maxResponseBytes: 6,
                deps: {
                    fetchImpl: async () =>
                        new Response(
                            new ReadableStream({
                                start(controller) {
                                    controller.enqueue(new TextEncoder().encode("1234567"));
                                },
                                cancel() {
                                    cancelled.push(status);
                                },
                            }),
                            { status, headers: { "content-type": "application/json" } },
                        ),
                },
            });
            expect(response.status).toBe(200);
        }

        expect(cancelled).toEqual([200, 503]);
    });

    test("bounds the aggregate result of a recovery-enabled loop in bytes", async () => {
        const sources = await productSources();
        const requests: string[] = [];
        const response = await executeFunction(recoveringProductsFunction(), functionRequest(), {
            sources,
            maxResponseBytes: 70,
            deps: {
                fetchImpl: async (input) => {
                    const id = requestProductId(input);
                    requests.push(id);
                    return id.startsWith("p") ? json({ error: "failed" }, 503) : json({ id });
                },
            },
        });

        await expectCorrelatedFunctionFailure(response);
        expect(requests).toEqual(["p1", "r1", "p2", "r2"]);
    });

    test("includes array syntax in the exact aggregate byte boundary", async () => {
        const expected = [{ itemId: "p1", failed: true, recoveryId: "r1" }];
        const exactBytes = new TextEncoder().encode(JSON.stringify(expected)).byteLength;
        const execute = async (maxResponseBytes: number) => {
            const sources = await productSources();
            return executeFunction(recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]), functionRequest(), {
                sources,
                maxResponseBytes,
                deps: {
                    fetchImpl: async (input) => {
                        const id = requestProductId(input);
                        return id === "p1" ? json({ error: "failed" }, 503) : json({ id });
                    },
                },
            });
        };

        const accepted = await execute(exactBytes);
        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toEqual(expected);
        const rejected = await execute(exactBytes - 1);
        expect(rejected.status).toBe(500);
    });
});

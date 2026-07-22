import { describe, expect, test } from "bun:test";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import { expectCorrelatedFunctionFailure } from "../helpers/functionFixtures";
import { readOrderFunction, systemFunctionProxyHarness } from "../helpers/systemFunctionProxyFixtures";

describe("system function source proxy contract", () => {
    test("preserves authorization and enriched output with one function read per request", async () => {
        const harness = await systemFunctionProxyHarness();
        const firstMark = harness.probe.mark();

        const first = await harness.request();

        expect(first.status).toBe(200);
        expect(await first.json()).toEqual(expectedBody("v1"));
        expect(harness.authorizedEndpoints).toEqual([expectedFunctionEndpoint("v1")]);
        expect(harness.executedEndpoints).toEqual([expectedFunctionEndpoint("v1")]);
        expect(harness.upstreamRequests).toEqual([{ method: "GET", url: "https://orders.test/orders/order-1" }]);
        expect(harness.probe.budgetSince(firstMark)).toMatchObject({
            functionLookups: 1,
            endpointLookups: 1,
            upstreamCalls: 1,
        });

        await harness.storedFunctions.updateFunction(readOrderFunction("v2"));
        const secondMark = harness.probe.mark();
        const second = await harness.request();

        expect(second.status).toBe(200);
        expect(await second.json()).toEqual(expectedBody("v2"));
        expect(harness.authorizedEndpoints).toEqual([expectedFunctionEndpoint("v1"), expectedFunctionEndpoint("v2")]);
        expect(harness.executedEndpoints).toEqual([expectedFunctionEndpoint("v1"), expectedFunctionEndpoint("v2")]);
        expect(harness.probe.budgetSince(secondMark)).toMatchObject({
            functionLookups: 1,
            endpointLookups: 1,
            upstreamCalls: 1,
        });
    });

    test("stops at the authorization endpoint and preserves the refusal", async () => {
        const harness = await systemFunctionProxyHarness();
        const mark = harness.probe.mark();

        const response = await harness.request({
            authorized: false,
            status: 401,
            body: "Authentication required",
        });

        expect(response.status).toBe(401);
        expect(await response.text()).toBe("Authentication required");
        expect(harness.authorizedEndpoints).toEqual([expectedFunctionEndpoint("v1")]);
        expect(harness.executedEndpoints).toEqual([]);
        expect(harness.upstreamRequests).toEqual([]);
        expect(harness.probe.budgetSince(mark)).toMatchObject({
            functionLookups: 1,
            endpointLookups: 0,
            upstreamCalls: 0,
        });
    });

    test("keeps upstream failures generic after one function read", async () => {
        const harness = await systemFunctionProxyHarness(503);
        const mark = harness.probe.mark();

        const response = await harness.request();

        await expectCorrelatedFunctionFailure(response, 502);
        expect(harness.authorizedEndpoints).toEqual([expectedFunctionEndpoint("v1")]);
        expect(harness.executedEndpoints).toEqual([expectedFunctionEndpoint("v1")]);
        expect(harness.probe.budgetSince(mark)).toMatchObject({
            functionLookups: 1,
            endpointLookups: 1,
            upstreamCalls: 1,
        });
    });
});

function expectedBody(version: string) {
    return {
        version,
        order: {
            id: "order-1",
            metadata: { reference: "REF-001" },
        },
    };
}

function expectedFunctionEndpoint(version: string): SourceEndpoint {
    return {
        urn: "urn:system-functions:readOrder",
        method: "GET",
        targetUrl: "cms-system://functions/readOrder",
        access: { mode: "admin" },
        meta: { name: `Read order ${version}` },
        input: {
            params: [{ name: "orderId", in: "query", schema: { type: "string" } }],
        },
    };
}

import { describe, expect, test } from "bun:test";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
} from "@bernouy/cms-sources";
import { FunctionExecutionProbe } from "../helpers/functionExecutionProbe";

describe("function execution contract", () => {
    test("preserves the response and ordered provider calls for repeated endpoints", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(paymentsSource());
        const probe = new FunctionExecutionProbe(inner);
        const upstream: Array<{ authorization: string | null; body: unknown }> = [];
        const mark = probe.mark();

        const response = await executeFunction(paymentWorkflow(), request(), {
            sources: probe.sources,
            user: { id: "buyer-1", role: "user" },
            deps: probe.deps({
                resolveContext: async () => ({}),
                resolveSecret: async () => "provider-secret",
                fetchImpl: async (input, init) => {
                    const providerRequest = new Request(input, init);
                    const body = await providerRequest.json() as Record<string, unknown>;
                    upstream.push({
                        authorization: providerRequest.headers.get("authorization"),
                        body,
                    });
                    return Response.json(body.phase === "prepare"
                        ? {
                            operationId: "op-prepare",
                            state: "prepared",
                            reviewReason: null,
                            events: ["reserved", "checked"],
                            providerSecret: "must-be-projected-out",
                        }
                        : {
                            operationId: "op-confirm",
                            state: "confirmed",
                            reviewReason: null,
                            events: ["captured", "projected"],
                            providerSecret: "must-be-projected-out",
                        });
                },
            }),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: "order-1",
            prepared: {
                operationId: "op-prepare",
                state: "prepared",
                reviewReason: null,
                events: ["reserved", "checked"],
            },
            confirmed: {
                operationId: "op-confirm",
                state: "confirmed",
                reviewReason: null,
                events: ["captured", "projected"],
            },
        });
        expect(upstream).toEqual([
            {
                authorization: "Bearer provider-secret",
                body: { phase: "prepare", orderId: "order-1" },
            },
            {
                authorization: "Bearer provider-secret",
                body: {
                    phase: "confirm",
                    orderId: "order-1",
                    previousOperationId: "op-prepare",
                },
            },
        ]);
        expect(probe.budgetSince(mark)).toMatchObject({
            upstreamCalls: 2,
            uniqueEndpointUrns: 1,
            uniqueUpstreamTargets: 1,
        });
    });

    test("keeps a failed provider response generic and stops later calls", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(paymentsSource());
        const probe = new FunctionExecutionProbe(inner);
        const mark = probe.mark();
        const response = await executeFunction(paymentWorkflow(), request(), {
            sources: probe.sources,
            user: { id: "buyer-1", role: "user" },
            deps: probe.deps({
                resolveContext: async () => ({}),
                resolveSecret: async () => "provider-secret",
                fetchImpl: async () => Response.json({
                    error: "provider rejected operation",
                    internalReason: "must-not-leak",
                }, { status: 409 }),
            }),
        });

        expect(response.status).toBe(502);
        const correlationId = response.headers.get("x-correlation-id");
        expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(probe.budgetSince(mark).upstreamCalls).toBe(1);
    });
});

function paymentWorkflow(): CmsFunction {
    return {
        id: "applyProtectedPayment",
        method: "POST",
        input: {
            body: {
                type: "object",
                properties: { orderId: { type: "string" } },
                required: ["orderId"],
            },
        },
        steps: [
            {
                id: "prepared",
                call: {
                    source: "payments",
                    endpoint: "applyOperation",
                    body: { phase: "prepare", orderId: "$input.body.orderId" },
                },
            },
            {
                id: "confirmed",
                call: {
                    source: "payments",
                    endpoint: "applyOperation",
                    body: {
                        phase: "confirm",
                        orderId: "$input.body.orderId",
                        previousOperationId: "$steps.prepared.operationId",
                    },
                },
            },
        ],
        return: {
            body: {
                orderId: "$input.body.orderId",
                prepared: "$steps.prepared",
                confirmed: "$steps.confirmed",
            },
        },
    };
}

function paymentsSource(): Source {
    return {
        urn: makeSourceUrn("payments"),
        endpoints: [{
            urn: makeEndpointUrn("payments", "applyOperation"),
            method: "POST",
            targetUrl: "https://provider.test/operations",
            headers: [
                { name: "authorization", source: { from: "secret", ref: "PAYMENTS_API_KEY", prefix: "Bearer " } },
                { name: "x-user-id", source: { from: "computed", ref: "userID" } },
            ],
            input: {
                body: {
                    type: "object",
                    properties: {
                        phase: { type: "string" },
                        orderId: { type: "string" },
                        previousOperationId: { type: "string" },
                    },
                    required: ["phase", "orderId"],
                },
            },
            output: [{
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        operationId: { type: "string" },
                        state: { type: "string" },
                        reviewReason: { type: "string", nullable: true },
                        events: { type: "array", items: { type: "string" } },
                    },
                    required: ["operationId", "state", "reviewReason", "events"],
                },
            }, {
                status: "409",
                body: {
                    type: "object",
                    properties: { error: { type: "string" } },
                    required: ["error"],
                },
            }],
        }],
    };
}

function request(): Request {
    return new Request("https://cms.test/function", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "order-1" }),
    });
}

import { describe, expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { FunctionExecutionProbe } from "../../helpers/functionExecutionProbe";
import {
    paymentFunctionRequest,
    paymentsSource,
    paymentWorkflow,
} from "../../helpers/functionExecutionContractFixtures";

describe("function execution contract", () => {
    test("preserves the response and ordered provider calls for repeated endpoints", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(paymentsSource());
        const probe = new FunctionExecutionProbe(inner);
        const upstream: Array<{ authorization: string | null; body: unknown }> = [];
        const mark = probe.mark();

        const response = await executeFunction(paymentWorkflow(), paymentFunctionRequest(), {
            sources: probe.sources,
            user: { id: "buyer-1", role: "user" },
            deps: probe.deps({
                resolveContext: async () => ({}),
                resolveSecret: async () => "provider-secret",
                fetchImpl: async (input, init) => {
                    const providerRequest = new Request(input, init);
                    const body = (await providerRequest.json()) as Record<string, unknown>;
                    upstream.push({
                        authorization: providerRequest.headers.get("authorization"),
                        body,
                    });
                    return Response.json(
                        body.phase === "prepare"
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
                              },
                    );
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
            endpointLookups: 1,
            upstreamCalls: 2,
            secretResolutions: 1,
            contextResolutions: 1,
            uniqueEndpointUrns: 1,
            uniqueUpstreamTargets: 1,
        });
    });

    test("keeps a failed provider response generic and stops later calls", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(paymentsSource());
        const probe = new FunctionExecutionProbe(inner);
        const mark = probe.mark();
        const response = await executeFunction(paymentWorkflow(), paymentFunctionRequest(), {
            sources: probe.sources,
            user: { id: "buyer-1", role: "user" },
            deps: probe.deps({
                resolveContext: async () => ({}),
                resolveSecret: async () => "provider-secret",
                fetchImpl: async () =>
                    Response.json(
                        {
                            error: "provider rejected operation",
                            internalReason: "must-not-leak",
                        },
                        { status: 409 },
                    ),
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
        expect(probe.budgetSince(mark)).toMatchObject({
            endpointLookups: 1,
            upstreamCalls: 1,
            secretResolutions: 1,
            contextResolutions: 1,
        });
    });
});

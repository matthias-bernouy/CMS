import { describe, expect, test } from "bun:test";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
} from "@bernouy/cms-sources";
import { FunctionExecutionProbe } from "../helpers/functionExecutionProbe";

describe("function execution isolation", () => {
    test("reloads endpoint, secret, and caller context for each execution", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(versionedSource("provider-a.test"));
        const probe = new FunctionExecutionProbe(inner);
        let secret = "secret-a";
        const requests: Array<Record<string, unknown>> = [];
        const execute = (user: { id: string; role: string }) => executeFunction(
            versionedFunction(),
            functionRequest(),
            {
                sources: probe.sources,
                user,
                deps: probe.deps({
                    resolveContext: async () => ({}),
                    resolveSecret: async () => secret,
                    fetchImpl: async (input, init) => {
                        const request = new Request(input, init);
                        const observed = {
                            provider: new URL(request.url).host,
                            userId: request.headers.get("x-user-id"),
                            userRole: request.headers.get("x-user-role"),
                            value: (await request.json() as { value: string }).value,
                        };
                        requests.push({
                            ...observed,
                            authorization: request.headers.get("authorization"),
                        });
                        return Response.json(observed);
                    },
                }),
            },
        );

        const firstMark = probe.mark();
        const first = await execute({ id: "buyer-a", role: "user" });
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({
            provider: "provider-a.test",
            userId: "buyer-a",
            userRole: "user",
            value: "payload",
        });
        expect(probe.budgetSince(firstMark)).toMatchObject({
            endpointLookups: 1,
            upstreamCalls: 1,
            secretResolutions: 1,
            contextResolutions: 1,
        });

        await inner.updateSource(versionedSource("provider-b.test"));
        secret = "secret-b";
        const secondMark = probe.mark();
        const second = await execute({ id: "buyer-b", role: "admin" });
        expect(second.status).toBe(200);
        expect(await second.json()).toEqual({
            provider: "provider-b.test",
            userId: "buyer-b",
            userRole: "admin",
            value: "payload",
        });
        expect(probe.budgetSince(secondMark)).toMatchObject({
            endpointLookups: 1,
            upstreamCalls: 1,
            secretResolutions: 1,
            contextResolutions: 1,
        });
        expect(requests).toEqual([
            {
                provider: "provider-a.test",
                authorization: "Bearer secret-a",
                userId: "buyer-a",
                userRole: "user",
                value: "payload",
            },
            {
                provider: "provider-b.test",
                authorization: "Bearer secret-b",
                userId: "buyer-b",
                userRole: "admin",
                value: "payload",
            },
        ]);
    });

    test("re-resolves cross-authority identity mappings between executions", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(commerceSource());
        await inner.createSource(stripeSource());
        const probe = new FunctionExecutionProbe(inner);
        let stripeSellerId = "acct_a";
        const identities = probe.identities({
            resolve: async (alias, targetAuthority) => {
                expect(alias).toEqual({ authority: "commerce", kind: "user", value: 184 });
                expect(targetAuthority).toBe("stripe-connect");
                return stripeSellerId;
            },
        });
        const paymentBodies: unknown[] = [];
        const deps = probe.deps({
            fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (new URL(request.url).host === "commerce.test") {
                    return Response.json({ sellerId: 184, amount: 2500 });
                }
                const body = await request.json() as {
                    sellerId: string;
                    reviewerSellerId: string;
                    amount: number;
                };
                paymentBodies.push(body);
                return Response.json({ paymentId: `payment-${body.sellerId}`, status: "pending" });
            },
        });

        const firstMark = probe.mark();
        const first = await executeFunction(identityFunction(), postRequest(), {
            sources: probe.sources,
            identities,
            deps,
        });
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({ paymentId: "payment-acct_a", status: "pending" });
        expect(probe.budgetSince(firstMark)).toMatchObject({
            endpointLookups: 2,
            upstreamCalls: 2,
            identityResolutions: 1,
        });

        stripeSellerId = "acct_b";
        const secondMark = probe.mark();
        const second = await executeFunction(identityFunction(), postRequest(), {
            sources: probe.sources,
            identities,
            deps,
        });
        expect(second.status).toBe(200);
        expect(await second.json()).toEqual({ paymentId: "payment-acct_b", status: "pending" });
        expect(probe.budgetSince(secondMark)).toMatchObject({
            endpointLookups: 2,
            upstreamCalls: 2,
            identityResolutions: 1,
        });
        expect(paymentBodies).toEqual([
            { sellerId: "acct_a", reviewerSellerId: "acct_a", amount: 2500 },
            { sellerId: "acct_b", reviewerSellerId: "acct_b", amount: 2500 },
        ]);
    });
});

function versionedFunction(): CmsFunction {
    return {
        id: "resolveVersionedProvider",
        method: "POST",
        steps: [{
            id: "resolved",
            call: { source: "versioned", endpoint: "resolve", body: { value: "payload" } },
        }],
        return: { body: "$steps.resolved" },
    };
}

function versionedSource(host: string): Source {
    return {
        urn: makeSourceUrn("versioned"),
        endpoints: [{
            urn: makeEndpointUrn("versioned", "resolve"),
            method: "POST",
            targetUrl: `https://${host}/resolve`,
            headers: [
                { name: "authorization", source: { from: "secret", ref: "PROVIDER_KEY", prefix: "Bearer " } },
                { name: "x-user-id", source: { from: "computed", ref: "userID" } },
                { name: "x-user-role", source: { from: "computed", ref: "userRole" } },
            ],
            input: {
                body: {
                    type: "object",
                    properties: { value: { type: "string" } },
                    required: ["value"],
                },
            },
            output: [{ status: "200", body: observedProviderShape() }],
        }],
    };
}

function observedProviderShape() {
    return {
        type: "object" as const,
        properties: {
            provider: { type: "string" as const },
            userId: { type: "string" as const },
            userRole: { type: "string" as const },
            value: { type: "string" as const },
        },
        required: ["provider", "userId", "userRole", "value"],
    };
}

function identityFunction(): CmsFunction {
    return {
        id: "createPaymentForOrder",
        method: "POST",
        steps: [
            { id: "order", call: { source: "commerce", endpoint: "getOrder" } },
            {
                id: "payment",
                call: {
                    source: "stripe-connect",
                    endpoint: "createPayment",
                    body: {
                        sellerId: "$steps.order.sellerId",
                        reviewerSellerId: "$steps.order.sellerId",
                        amount: "$steps.order.amount",
                    },
                },
            },
        ],
        return: { body: "$steps.payment" },
    };
}

function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        identityAuthority: "commerce",
        endpoints: [{
            urn: makeEndpointUrn("commerce", "getOrder"),
            method: "GET",
            targetUrl: "https://commerce.test/order",
            output: [{
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        sellerId: {
                            type: "number",
                            semantic: { kind: "user-id", authority: "commerce" },
                        },
                        amount: { type: "number" },
                    },
                    required: ["sellerId", "amount"],
                },
            }],
        }],
    };
}

function stripeSource(): Source {
    return {
        urn: makeSourceUrn("stripe-connect"),
        identityAuthority: "stripe-connect",
        endpoints: [{
            urn: makeEndpointUrn("stripe-connect", "createPayment"),
            method: "POST",
            targetUrl: "https://stripe.test/payment",
            input: {
                body: {
                    type: "object",
                    properties: {
                        sellerId: {
                            type: "string",
                            semantic: { kind: "user-id", authority: "stripe-connect" },
                        },
                        reviewerSellerId: {
                            type: "string",
                            semantic: { kind: "user-id", authority: "stripe-connect" },
                        },
                        amount: { type: "number" },
                    },
                    required: ["sellerId", "reviewerSellerId", "amount"],
                },
            },
            output: [{
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        paymentId: { type: "string" },
                        status: { type: "string" },
                    },
                    required: ["paymentId", "status"],
                },
            }],
        }],
    };
}

function functionRequest(): Request {
    return new Request("https://cms.test/function", { method: "POST" });
}

function postRequest(): Request {
    return new Request("https://cms.test/function", { method: "POST" });
}

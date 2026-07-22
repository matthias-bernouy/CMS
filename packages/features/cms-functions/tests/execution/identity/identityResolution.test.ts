import { describe, expect, test } from "bun:test";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn } from "@bernouy/cms-sources";

describe("function identity resolution", () => {
    test("translates an opaque user id and forwards the original caller context", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: makeSourceUrn("commerce"),
            identityAuthority: "commerce",
            endpoints: [
                {
                    urn: makeEndpointUrn("commerce", "getOrder"),
                    method: "GET",
                    targetUrl: "https://commerce.test/order",
                    output: [
                        {
                            status: "200",
                            body: {
                                type: "object",
                                properties: {
                                    sellerId: {
                                        type: "number",
                                        semantic: { kind: "user-id", authority: "commerce" },
                                    },
                                    total: { type: "number" },
                                },
                            },
                        },
                    ],
                },
            ],
        });
        await sources.createSource({
            urn: makeSourceUrn("stripe-connect"),
            identityAuthority: "stripe-connect",
            endpoints: [
                {
                    urn: makeEndpointUrn("stripe-connect", "createPayment"),
                    method: "POST",
                    targetUrl: "https://stripe.test/payment",
                    headers: [
                        { name: "x-user-id", source: { from: "computed", ref: "userID" } },
                        { name: "x-user-role", source: { from: "computed", ref: "userRole" } },
                    ],
                    input: {
                        body: {
                            type: "object",
                            properties: {
                                sellerId: {
                                    type: "string",
                                    semantic: { kind: "user-id", authority: "stripe-connect" },
                                },
                                amount: { type: "number" },
                            },
                            required: ["sellerId", "amount"],
                        },
                    },
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });

        const identities = new InMemoryIdentityService();
        await identities.bind("subject-seller", { authority: "commerce", kind: "user", value: 184 });
        await identities.bind("subject-seller", { authority: "stripe-connect", kind: "user", value: "acct_seller" });
        let paymentRequest: Request | null = null;
        const fn: CmsFunction = {
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
                            amount: "$steps.order.total",
                        },
                    },
                },
            ],
            return: { body: "$steps.payment" },
        };

        const response = await executeFunction(
            fn,
            new Request("https://cms.test/function", {
                method: "POST",
            }),
            {
                sources,
                identities,
                user: { id: "subject-buyer", role: "user" },
                deps: {
                    identities,
                    fetchImpl: async (request, init) => {
                        const upstream = new Request(request, init);
                        if (upstream.url.startsWith("https://commerce.test")) {
                            return Response.json({ sellerId: 184, total: 2500 });
                        }
                        paymentRequest = upstream;
                        return Response.json({ paymentId: 1 });
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(paymentRequest).not.toBeNull();
        expect(paymentRequest!.headers.get("x-user-id")).toBe("subject-buyer");
        expect(paymentRequest!.headers.get("x-user-role")).toBe("user");
        expect(await paymentRequest!.json()).toEqual({ sellerId: "acct_seller", amount: 2500 });
    });
});

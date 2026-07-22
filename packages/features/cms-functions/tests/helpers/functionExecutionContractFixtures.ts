import type { CmsFunction } from "@bernouy/cms-functions";
import { makeEndpointUrn, makeSourceUrn, type Source } from "@bernouy/cms-sources";

export function paymentWorkflow(): CmsFunction {
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

export function paymentsSource(): Source {
    return {
        urn: makeSourceUrn("payments"),
        endpoints: [
            {
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
                output: [
                    {
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
                    },
                    {
                        status: "409",
                        body: {
                            type: "object",
                            properties: { error: { type: "string" } },
                            required: ["error"],
                        },
                    },
                ],
            },
        ],
    };
}

export function paymentFunctionRequest(): Request {
    return new Request("https://cms.test/function", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "order-1" }),
    });
}

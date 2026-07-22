import { describe, expect, test } from "bun:test";
import {
    executePaymentWorkflow,
    getRequest,
    refreshRequest,
    type CapturedCall,
    type PaymentFunctionId,
} from "./harness";
import { payment } from "./expected";
import { successfulResponder } from "./responders";

const snapshots = [
    {
        ...payment,
        paymentStatus: "requires_action",
        commercePaymentStatus: "pending",
        updatedAt: "2026-07-17T10:00:00.000Z",
    },
    {
        ...payment,
        paymentStatus: "succeeded",
        commercePaymentStatus: "succeeded",
        updatedAt: "2026-07-17T10:01:00.000Z",
    },
];

describe("Commerce Stripe payment workflow freshness", () => {
    for (const [id, request] of [
        ["getPaymentForOrder", getRequest],
        ["refreshPaymentForOrder", refreshRequest],
    ] as const) {
        test(`${id} performs a fresh protected Stripe lookup on every execution`, async () => {
            const executions: { body: Record<string, unknown>; calls: CapturedCall[] }[] = [];
            for (const snapshot of snapshots) {
                const result = await executePaymentWorkflow(id satisfies PaymentFunctionId, request(), (outgoing) => {
                    if (new URL(outgoing.url).pathname === "/payments/reference") {
                        return Response.json({
                            exists: true,
                            payment: snapshot,
                        });
                    }
                    return successfulResponder(outgoing);
                });
                expect(result.response.status).toBe(200);
                executions.push({
                    body: (await result.response.json()) as Record<string, unknown>,
                    calls: result.calls,
                });
            }

            expect(
                executions.map((execution) => (execution.body.payment as Record<string, unknown>).paymentStatus),
            ).toEqual(["requires_action", "succeeded"]);
            expect(
                executions.map(
                    (execution) => execution.calls.filter((call) => call.url.pathname === "/payments/reference").length,
                ),
            ).toEqual([1, 1]);
        });
    }

    test("refresh derives each projection event from the current Stripe snapshot", async () => {
        const eventIds = [];
        for (const snapshot of snapshots) {
            const { response, calls } = await executePaymentWorkflow(
                "refreshPaymentForOrder",
                refreshRequest(),
                (outgoing) => {
                    if (new URL(outgoing.url).pathname === "/payments/reference") {
                        return Response.json({ exists: true, payment: snapshot });
                    }
                    return successfulResponder(outgoing);
                },
            );

            expect(response.status).toBe(200);
            eventIds.push((calls.at(-1)?.body as Record<string, unknown>).providerEventId);
        }

        expect(eventIds).toEqual(
            snapshots.map((snapshot) => `payment-sync:${snapshot.paymentId}:${snapshot.updatedAt}`),
        );
    });
});

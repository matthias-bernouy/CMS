import { describe, expect, test } from "bun:test";
import {
    executePaymentWorkflow,
    getRequest,
    loadPaymentFunction,
    refreshRequest,
    type PaymentFunctionId,
} from "./harness";
import { failingResponder, missingPaymentResponder, successfulResponder } from "./responders";
import { order } from "./expected";

describe("Commerce Stripe payment workflow boundaries", () => {
    test("keeps authenticated access and validates refresh input before source work", async () => {
        expect((await loadPaymentFunction("getPaymentForOrder")).access).toEqual({ mode: "auth" });
        expect((await loadPaymentFunction("refreshPaymentForOrder")).access).toEqual({ mode: "auth" });

        const invalid = await executePaymentWorkflow("refreshPaymentForOrder", refreshRequest({}), successfulResponder);

        expect(invalid.response.status).toBe(400);
        expect(await invalid.response.json()).toEqual({
            error: "body.orderId is required",
        });
        expect(invalid.calls).toEqual([]);
    });

    test("rejects an invalid query selector before source work", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "getPaymentForOrder",
            new Request("https://cms.test/functions/getPaymentForOrder?orderId=invalid"),
            successfulResponder,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: "params.orderId must be a number",
        });
        expect(calls).toEqual([]);
    });

    for (const [id, request] of workflows()) {
        test(`${id} normalizes anonymous source refusal before network work`, async () => {
            const { response, calls } = await executePaymentWorkflow(id, request(), successfulResponder, null);

            await expectGenericFailure(response);
            expect(calls).toEqual([]);
        });

        test(`${id} stops when the order belongs to another buyer`, async () => {
            const { response, calls } = await executePaymentWorkflow(id, request(), (outgoing) =>
                new URL(outgoing.url).pathname.includes("order")
                    ? Response.json({ ...order, buyerCmsUserId: "other-buyer" })
                    : successfulResponder(outgoing),
            );

            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({
                error: "Order does not belong to the current buyer",
            });
            expect(calls).toHaveLength(1);
        });

        for (const point of ["order", "payment"] as const) {
            test(`${id} fails closed when ${point} refuses`, async () => {
                const { response, calls } = await executePaymentWorkflow(id, request(), failingResponder(point));

                expectGenericFailure(response);
                expect(calls.map((call) => call.url.pathname)).toEqual(
                    point === "order"
                        ? ["/system/order/payment-context"]
                        : ["/system/order/payment-context", "/payments/reference"],
                );
            });
        }
    }

    test("refresh returns 404 without projecting a missing payment", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "refreshPaymentForOrder",
            refreshRequest(),
            missingPaymentResponder,
        );

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            error: "Payment does not exist for this order",
        });
        expect(calls.map((call) => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/payments/reference",
        ]);
    });

    test("refresh hides a projection refusal after the provider lookup", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "refreshPaymentForOrder",
            refreshRequest(),
            failingResponder("projection"),
        );

        expectGenericFailure(response);
        expect(calls.map((call) => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/payments/reference",
            "/system/order/payment",
        ]);
    });
});

function workflows(): [PaymentFunctionId, () => Request][] {
    return [
        ["getPaymentForOrder", getRequest],
        ["refreshPaymentForOrder", refreshRequest],
    ];
}

async function expectGenericFailure(response: Response): Promise<void> {
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
        error: "Function execution failed",
        correlationId: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain("private");
}

import { describe, expect, test } from "bun:test";
import {
    executePaymentWorkflow,
    getRequest,
    refreshRequest,
} from "./harness";
import { successfulResponder } from "./responders";

describe("Commerce Stripe payment workflow call budgets", () => {
    test("reads the buyer order before the protected provider lookup", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "getPaymentForOrder",
            getRequest(),
            successfulResponder,
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/me/order",
            "/payments/reference",
        ]);
        expect(calls.map(call => call.method)).toEqual(["GET", "GET"]);
    });

    test("refreshes provider truth before the Commerce projection", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "refreshPaymentForOrder",
            refreshRequest(),
            successfulResponder,
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/me/order",
            "/payments/reference",
            "/system/order/payment",
        ]);
        expect(calls.map(call => call.method)).toEqual([
            "GET",
            "GET",
            "POST",
        ]);
    });
});

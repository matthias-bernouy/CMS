import { describe, expect, test } from "bun:test";
import { getRequest, executePaymentWorkflow, refreshRequest } from "./harness";
import { order, payment, publicPayment, recordPaymentBody } from "./expected";
import { missingPaymentResponder, successfulResponder } from "./responders";

describe("Commerce Stripe payment workflow contracts", () => {
    test("returns the exact protected payment without leaking internal fields", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "getPaymentForOrder",
            getRequest(),
            successfulResponder,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: order.id,
            orderPublicId: order.publicId,
            paymentExists: true,
            payment: publicPayment,
        });
        expect(JSON.stringify(await response.clone().text())).not.toContain("sellerUserId");
        expect(calls[0]?.headers.get("x-cms-user-id")).toBe("buyer-user");
        expect(calls[1]?.headers.get("x-user-id")).toBe("buyer-user");
        expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
            clientReferenceId: order.publicId,
        });
    });

    test("preserves the missing-payment response and omitted payment field", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "getPaymentForOrder",
            getRequest(),
            missingPaymentResponder,
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            orderId: order.id,
            orderPublicId: order.publicId,
            paymentExists: false,
        });
        expect(Object.hasOwn(body, "payment")).toBeFalse();
        expect(calls).toHaveLength(2);
    });

    test("refreshes provider truth before projecting and returns the exact DTO", async () => {
        const { response, calls } = await executePaymentWorkflow(
            "refreshPaymentForOrder",
            refreshRequest(),
            successfulResponder,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: order.id,
            orderPublicId: order.publicId,
            payment: publicPayment,
        });
        expect(calls[2]?.method).toBe("POST");
        expect(calls[2]?.body).toEqual(recordPaymentBody);
        expect(calls[2]?.body).toMatchObject({
            providerSnapshot: {
                paymentId: payment.paymentId,
                buyerUserId: payment.buyerUserId,
                sellerUserId: payment.sellerUserId,
                updatedAt: payment.updatedAt,
            },
        });
    });
});

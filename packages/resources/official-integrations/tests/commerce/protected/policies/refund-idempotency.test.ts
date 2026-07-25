import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";

installCommerceTestEnvironment();

describe("commerce allocated refund HTTP idempotency", () => {
    test("forwards the same opaque key on sequential admin refund retries", async () => {
        const body = {
            orderId: 42,
            reason: "admin_resolution",
            idempotencyKey: "refund-operation-retry-42",
            merchandiseRefundAmount: 7_600,
            shippingRefundAmount: 0,
            protectionFeeRefundAmount: 400,
            businessKey: "must-never-reach-the-database",
        };

        const first = await requestCommerce("/admin/order/refund", {
            userId: "admin-7",
            userRole: "admin",
            body,
        });
        const replay = await requestCommerce("/admin/order/refund", {
            userId: "admin-7",
            userRole: "admin",
            body,
        });

        expect(first.status).toBe(201);
        expect(replay.status).toBe(201);
        const calls = capturedFetches().filter((call) =>
            call.url.endsWith("/rest/v1/rpc/request_allocated_order_refund"),
        );
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            expect(call.body).toMatchObject({
                p_order_id: 42,
                p_actor_kind: "admin",
                p_actor_id: "admin-7",
                p_idempotency_key: "refund-operation-retry-42",
            });
            expect(call.body).not.toHaveProperty("p_business_key");
        }
    });

    test("does not accept a raw business key in place of admin refund idempotency", async () => {
        const response = await requestCommerce("/admin/order/refund", {
            userId: "admin-7",
            userRole: "admin",
            body: {
                orderId: 42,
                reason: "admin_resolution",
                businessKey: "attacker-controlled-key",
                merchandiseRefundAmount: 7_600,
                shippingRefundAmount: 0,
                protectionFeeRefundAmount: 400,
            },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "idempotencyKey is required" });
        expect(capturedFetches()).toHaveLength(0);
    });
});

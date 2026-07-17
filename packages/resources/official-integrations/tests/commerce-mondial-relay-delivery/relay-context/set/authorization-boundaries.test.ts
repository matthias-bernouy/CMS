import { describe, expect, test } from "bun:test";
import { executeRelay, expectGenericFailure } from "../harness";
import { successfulResponder } from "../responders";
import { paths } from "./calls";

describe("setRelayPointForOrder boundaries", () => {
    test("keeps buyer then status then authorization precedence", async () => {
        const wrongBuyer = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                order: { buyerCmsUserId: "another-buyer" },
            }),
        );
        const wrongStatus = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                order: { status: "pending_payment" },
            }),
        );
        const wrongBuyerAndStatus = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                order: {
                    buyerCmsUserId: "another-buyer",
                    status: "pending_payment",
                },
            }),
        );
        const changed = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                authorization: { orderVersion: 2 },
            }),
        );

        expect([
            wrongBuyer.response.status,
            await wrongBuyer.response.json(),
            paths(wrongBuyer.calls),
        ]).toEqual([
            403,
            { error: "Order does not belong to the current buyer" },
            ["/delivery-setup-context"],
        ]);
        expect([
            wrongStatus.response.status,
            await wrongStatus.response.json(),
            paths(wrongStatus.calls),
        ]).toEqual([
            409,
            {
                error:
                    "Pickup point can only be changed before order finalization",
            },
            ["/delivery-setup-context"],
        ]);
        expect([
            wrongBuyerAndStatus.response.status,
            await wrongBuyerAndStatus.response.json(),
            paths(wrongBuyerAndStatus.calls),
        ]).toEqual([
            403,
            { error: "Order does not belong to the current buyer" },
            ["/delivery-setup-context"],
        ]);
        expect([
            changed.response.status,
            await changed.response.json(),
            paths(changed.calls),
        ]).toEqual([
            409,
            { error: "Order delivery authorization changed" },
            ["/delivery-setup-context"],
        ]);
    });

    for (const [field, value] of [
        ["buyerCmsUserId", "another-buyer"],
        ["status", "pending_payment"],
        ["orderVersion", 2],
    ] as const) {
        test(`rejects changed authorization ${field} before account work`, async () => {
            const result = await executeRelay(
                "setRelayPointForOrder",
                successfulResponder({
                    authorization: { [field]: value },
                }),
            );

            expect(result.response.status).toBe(409);
            expect(await result.response.json()).toEqual({
                error: "Order delivery authorization changed",
            });
            expect(paths(result.calls)).toEqual([
                "/delivery-setup-context",
            ]);
        });
    }

    test("rejects malformed Commerce successes at their source boundary", async () => {
        const malformedOrder = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({ order: { publicId: null } }),
        );
        const malformedAuthorization = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                authorization: { shippingAddress: null },
            }),
        );
        const missingSeller = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                authorization: { sellerCmsUserId: null },
            }),
        );

        await expectGenericFailure(malformedOrder.response);
        expect(paths(malformedOrder.calls)).toEqual([
            "/delivery-setup-context",
        ]);
        for (const result of [malformedAuthorization, missingSeller]) {
            await expectGenericFailure(result.response);
            expect(paths(result.calls)).toEqual([
                "/delivery-setup-context",
            ]);
        }
    });
});

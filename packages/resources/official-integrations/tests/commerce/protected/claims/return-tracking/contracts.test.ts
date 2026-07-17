import { describe, expect, test } from "bun:test";
import {
    authorization,
    publicEvents,
    publicResponse,
    publicShipment,
} from "./fixtures";
import { executeClaimTracking } from "./harness";
import { successfulResponder } from "./responders";

describe("Commerce Mondial Relay claim return tracking contracts", () => {
    for (const userId of ["buyer-user", "seller-user"]) {
        test(`returns the exact allowlisted tracking DTO to ${userId}`, async () => {
            const { response, calls } = await executeClaimTracking(
                successfulResponder(),
                { user: { id: userId, role: "user" } },
            );

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(publicResponse);
            expect(calls[0]?.url.searchParams.get("claimId")).toBe("7");
            expect(calls[1]?.url.searchParams.get("externalOrderId"))
                .toBe("claim-return:7");
        });
    }

    test("omits shipment, recipient, provider, and authorization internals", async () => {
        const { response } = await executeClaimTracking(successfulResponder());

        const body = await response.json();
        const serialized = JSON.stringify(body);
        expect(body.shipments).toEqual([publicShipment]);
        expect(serialized).not.toContain("sellerHandoffDeclaredAt");
        expect(serialized).not.toContain("recipientName");
        expect(serialized).not.toContain("Private Street");
        expect(serialized).not.toContain("providerEventKey");
        expect(serialized).not.toContain("providerPayload");
        expect(serialized).not.toContain("buyerCmsUserId");
        expect(serialized).not.toContain("sellerCmsUserId");
        expect(serialized).not.toContain("deliveryQuoteId");
    });

    test("preserves nulls, event ordering, and an empty tracking collection", async () => {
        const nullableShipment = {
            expeditionNumber: null,
            trackingUrl: null,
            latestEventLabel: null,
            latestEventAt: null,
            carrierAcceptedAt: null,
            recipientHandoffAt: null,
        };
        const nullableAuthorization = {
            allowed: false,
            reason: "return_not_required",
            returnShipByAt: null,
            returnDeliveryStatus: null,
        };
        const tracked = await executeClaimTracking(
            successfulResponder({
                authorization: nullableAuthorization,
                shipment: nullableShipment,
            }),
        );
        const empty = await executeClaimTracking(
            successfulResponder({
                authorization: nullableAuthorization,
                empty: true,
            }),
        );

        expect(tracked.response.status).toBe(200);
        expect(await tracked.response.json()).toEqual({
            ...publicResponse,
            ...nullableAuthorization,
            shipments: [{
                ...publicShipment,
                ...nullableShipment,
                events: publicEvents,
            }],
        });
        expect(await empty.response.json()).toEqual({
            claimId: authorization.claimId,
            claimStatus: authorization.claimStatus,
            returnShipByAt: null,
            returnDeliveryStatus: null,
            orderNumber: authorization.orderNumber,
            allowed: false,
            reason: "return_not_required",
            shipments: [],
        });
    });
});

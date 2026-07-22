import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerClaimReturnAuthorizationTests(): void {
    test("fails before Delivery when a non-buyer requests a claim return label", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "requestClaimReturnLabelForMyPurchase");
        let reachedDelivery = false;
        const response = await executeFunction(fn, request("requestClaimReturnLabelForMyPurchase", { claimId: 7 }), {
            sources,
            user: { id: "unrelated-user", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    if (new URL(req.url).pathname === "/claim-return-authorization") {
                        return Response.json({
                            allowed: true,
                            reason: "authorized",
                            claimId: 7,
                            claimPublicId: "claim-7",
                            claimStatus: "return_required",
                            claimVersion: 2,
                            returnShipByAt: "2026-07-20T09:00:00.000Z",
                            returnDeliveryStatus: "awaiting_carrier",
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            orderNumber: "CO-42",
                            buyerCmsUserId: "buyer-subject",
                            sellerId: 12,
                            sellerCmsUserId: "seller-subject",
                        });
                    }
                    reachedDelivery = true;
                    return Response.json({});
                },
            },
        });
        expect(response.status).toBe(403);
        expect(reachedDelivery).toBe(false);
    });

    test("does not create a return when Commerce revokes authorization during preparation", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createClaimReturnShipmentForMyPurchase");
        let authorizationCalls = 0;
        let shipmentCreated = false;
        const response = await executeFunction(fn, request("createClaimReturnShipmentForMyPurchase", { claimId: 7 }), {
            sources,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/claim-return-authorization") {
                        authorizationCalls += 1;
                        return Response.json({
                            allowed: authorizationCalls === 1,
                            reason: authorizationCalls === 1 ? "authorized" : "return_ship_deadline_passed",
                            claimId: 7,
                            claimPublicId: "claim-7",
                            claimStatus: authorizationCalls === 1 ? "return_required" : "under_review",
                            claimVersion: authorizationCalls === 1 ? 2 : 3,
                            returnShipByAt: "2026-07-13T09:00:00.000Z",
                            returnDeliveryStatus: "awaiting_carrier",
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            orderNumber: "CO-42",
                            buyerCmsUserId: "buyer-subject",
                            sellerId: 12,
                            sellerCmsUserId: "seller-subject",
                        });
                    }
                    if (path === "/order") {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            shippingAddress: {
                                recipient: "Buyer Name",
                                givenName: "Buyer",
                                surname: "Name",
                                phone: "+33600000000",
                                addressLine1: "1 Buyer Street",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "75001",
                                city: "Paris",
                                countryCode: "FR",
                            },
                        });
                    }
                    if (path === "/getAccountByUserId") {
                        return Response.json({
                            givenName: "Seller",
                            surname: "Name",
                            phone: "+33611111111",
                            addressLine1: "2 Seller Street",
                            addressLine2: "",
                            addressLine3: "",
                            postalCode: "69001",
                            city: "Lyon",
                            countryCode: "FR",
                        });
                    }
                    if (path === "/relaySelection") {
                        return Response.json({ relayLocation: "FR-024474", weightGrams: 500 });
                    }
                    if (path === "/createShipment") {
                        shipmentCreated = true;
                    }
                    return Response.json({});
                },
            },
        });
        expect(response.status).toBe(409);
        expect(authorizationCalls).toBe(2);
        expect(shipmentCreated).toBe(false);
    });
}

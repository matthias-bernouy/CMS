import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerClaimReturnCreationTests(): void {
    test("creates an idempotent claim return from trusted buyer, seller, and relay snapshots", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createClaimReturnShipmentForMyPurchase");
        const calls: Array<{ path: string; body: unknown }> = [];
        const response = await executeFunction(fn, request("createClaimReturnShipmentForMyPurchase", { claimId: 7 }), {
            sources,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    calls.push({ path, body: req.method === "POST" ? await req.clone().json() : undefined });
                    if (path === "/claim-return-authorization") {
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
                            deliveryQuoteId: "quote-42",
                            merchandiseSubtotalMinorAmount: 11000,
                            currency: "eur",
                        });
                    }
                    if (path === "/resolveDeliveryQuote") {
                        return Response.json({
                            quoteId: "quote-42",
                            externalOrderId: "order-public-42",
                            orderVersion: 1,
                            revision: 1,
                            selectedForCmsUserId: "buyer-subject",
                            relayLocation: "FR-031270",
                            country: "FR",
                            number: "031270",
                            name: "Original relay",
                            addressLine1: "3 Relay Street",
                            addressLine2: "",
                            postalCode: "75002",
                            city: "Paris",
                            weightGrams: 500,
                            shippingAmount: 450,
                            currency: "eur",
                            merchandiseSubtotalMinorAmount: 11000,
                            quotedAt: "2026-07-01T09:00:00.000Z",
                            expiresAt: "2026-07-01T09:15:00.000Z",
                            recipientSnapshot: {
                                name: "Buyer Name",
                                firstName: "Buyer",
                                lastName: "Name",
                                email: "",
                                phone: "+33600000000",
                                addressLine1: "1 Buyer Street",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "75001",
                                city: "Paris",
                                country: "FR",
                            },
                            sellerFulfillmentSnapshot: {
                                name: "Seller Name",
                                firstName: "Seller",
                                lastName: "Name",
                                email: "",
                                phone: "+33611111111",
                                addressLine1: "2 Seller Street",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "69001",
                                city: "Lyon",
                                country: "FR",
                            },
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
                        expect(new URL(req.url).searchParams.get("userId")).toBe("seller-subject");
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
                        expect(new URL(req.url).searchParams.get("externalOrderId")).toBe("claim-return:7");
                        return Response.json({ relayLocation: "FR-024474", weightGrams: 500 });
                    }
                    if (path === "/createShipment") {
                        return Response.json({
                            ok: true,
                            id: "return-shipment-7",
                            expeditionNumber: "87654321",
                            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=87654321",
                            status: "label_ready",
                            createdAt: "2026-07-13T09:00:00.000Z",
                            idempotentReplay: true,
                        });
                    }
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(calls.map((call) => call.path)).toEqual([
            "/claim-return-authorization",
            "/resolveDeliveryQuote",
            "/relaySelection",
            "/claim-return-authorization",
            "/createShipment",
        ]);
        expect(calls.find((call) => call.path === "/createShipment")?.body).toMatchObject({
            externalOrderId: "claim-return:7",
            deliveryQuoteId: "quote-42",
            senderName: "Buyer Name",
            senderAddressLine1: "1 Buyer Street",
            recipientName: "Seller Name",
            recipientAddressLine1: "2 Seller Street",
            deliveryRelayLocation: "FR-024474",
            declaredValueMinorAmount: 11000,
            metadata: {
                commerceClaimId: 7,
                commerceOrderId: "order-public-42",
                shipmentKind: "claim_return",
                deliveryQuoteId: "quote-42",
                declaredValueMinorAmount: 11000,
                declaredCurrency: "EUR",
            },
        });
        const body = await response.json();
        expect(body.shipment.idempotentReplay).toBe(true);
        expect(JSON.stringify(body)).not.toContain("labelUrl");
        expect(JSON.stringify(body)).not.toContain("Seller Street");
    });
}

import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerShipmentCreationTests(): void {
    test("creates one shipment only after Commerce authorization and records label creation", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createShipmentForMySale");
        const calls: Array<{ url: string; body: unknown }> = [];

        const response = await executeFunction(fn, request("createShipmentForMySale", { orderId: "42" }), {
            sources,
            user: { id: "seller-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const url = new URL(req.url);
                    const body = req.method === "POST" ? await req.clone().json() : undefined;
                    calls.push({ url: req.url, body });
                    if (url.pathname === "/shipment-creation-seller-context") {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            allowed: true,
                            sellerId: "seller-subject",
                        });
                    }
                    if (url.pathname === "/reserveShipmentCreation") {
                        return Response.json({
                            operationId: 501,
                            claimToken: "00000000-0000-4000-8000-000000000501",
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            sellerId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                            currency: "eur",
                            deliveryQuoteId: "quote-42",
                            merchandiseSubtotalMinorAmount: 11000,
                            shippingAmount: 450,
                            buyerTotalAmount: 11450,
                            financialTermsHash: "terms-42",
                            paymentStatus: "succeeded",
                            fulfillmentStatus: "shipment_creating",
                        });
                    }
                    if (url.pathname === "/resolveDeliveryQuote") {
                        return Response.json({
                            quoteId: "quote-42",
                            externalOrderId: "order-public-42",
                            orderVersion: 1,
                            revision: 1,
                            selectedForCmsUserId: "buyer-subject",
                            relayLocation: "FR-024474",
                            country: "FR",
                            number: "024474",
                            name: "Relay",
                            addressLine1: "3 Relay Street",
                            addressLine2: "",
                            postalCode: "75002",
                            city: "Paris",
                            weightGrams: 500,
                            shippingAmount: 450,
                            currency: "eur",
                            merchandiseSubtotalMinorAmount: 11000,
                            quotedAt: "2026-07-12T09:00:00.000Z",
                            expiresAt: "2026-07-12T09:15:00.000Z",
                            recipientSnapshot: {
                                name: "Alice Buyer",
                                firstName: "Alice",
                                lastName: "Buyer",
                                email: "",
                                phone: "+33600000000",
                                addressLine1: "1 rue du Test",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "75001",
                                city: "Paris",
                                country: "FR",
                            },
                            sellerFulfillmentSnapshot: {
                                name: "Seller Test",
                                firstName: "Seller",
                                lastName: "Test",
                                email: "",
                                phone: "+33611111111",
                                addressLine1: "2 rue du Vendeur",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "69001",
                                city: "Lyon",
                                country: "FR",
                            },
                        });
                    }
                    if (url.pathname === "/order") {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            shippingAddress: {
                                recipient: "Alice Buyer",
                                phone: "+33600000000",
                                addressLine1: "1 rue du Test",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "75001",
                                city: "Paris",
                                countryCode: "FR",
                            },
                        });
                    }
                    if (url.pathname === "/relaySelection") {
                        return Response.json({ relayLocation: "FR-024474", weightGrams: 500 });
                    }
                    if (url.pathname === "/getAccountByUserId") {
                        return Response.json({
                            givenName: "Seller",
                            surname: "Test",
                            phone: "+33611111111",
                            addressLine1: "2 rue du Vendeur",
                            addressLine2: "",
                            addressLine3: "",
                            postalCode: "69001",
                            city: "Lyon",
                            countryCode: "FR",
                        });
                    }
                    if (url.pathname === "/createShipment") {
                        return Response.json(
                            {
                                ok: true,
                                id: "shipment-42",
                                expeditionNumber: "12345678",
                                trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=12345678",
                                status: "label_ready",
                                createdAt: "2026-07-13T09:00:00.000Z",
                            },
                            { status: 201 },
                        );
                    }
                    if (url.pathname === "/completeShipmentCreation") {
                        return Response.json({
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            status: "label_created",
                            providerReference: "12345678",
                            version: 1,
                        });
                    }
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        const shipmentCall = calls.find((call) => new URL(call.url).pathname === "/createShipment");
        expect(shipmentCall?.body).toMatchObject({
            externalOrderId: "order-public-42",
            deliveryQuoteId: "quote-42",
            senderName: "Seller Test",
            recipientName: "Alice Buyer",
            deliveryRelayLocation: "FR-024474",
            packageCount: 1,
            declaredValueMinorAmount: 11000,
            declaredCurrency: "EUR",
            metadata: {
                commerceOrderId: "order-public-42",
                financialTermsHash: "terms-42",
                deliveryQuoteId: "quote-42",
                declaredValueMinorAmount: 11000,
                declaredCurrency: "EUR",
            },
        });
        const commerceCall = calls.find((call) => new URL(call.url).pathname === "/completeShipmentCreation");
        expect(commerceCall?.body).toEqual({
            operationId: 501,
            claimToken: "00000000-0000-4000-8000-000000000501",
            providerReference: "12345678",
            providerShipmentId: "shipment-42",
            providerSnapshot: { status: "label_ready", createdAt: "2026-07-13T09:00:00.000Z" },
        });
        const body = await response.json();
        expect(JSON.stringify(body)).not.toContain("labelUrl");
        expect(calls.some((call) => call.url.includes("stripe"))).toBe(false);
    });
}

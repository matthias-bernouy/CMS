import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { fulfillmentQuote } from "../fixtures";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerShipmentCreationOperationTests(): void {
    test("recovers a lost shipment-create response through the durable operation worker", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayShipmentOperations");
        const calls: Array<{ path: string; body: unknown }> = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "shipment-saga-recovery", limit: 5 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    const body = req.method === "POST" ? await req.clone().json() : undefined;
                    calls.push({ path, body });
                    if (path === "/claimShipmentCreations") {
                        return Response.json({
                            items: [
                                {
                                    operationId: 501,
                                    claimToken: "00000000-0000-4000-8000-000000000501",
                                    orderPublicId: "order-public-42",
                                    sellerId: "seller-subject",
                                    buyerCmsUserId: "buyer-subject",
                                    deliveryQuoteId: "quote-42",
                                    merchandiseSubtotalMinorAmount: 11000,
                                    currency: "EUR",
                                    financialTermsHash: "terms-42",
                                },
                            ],
                        });
                    }
                    if (path === "/resolveDeliveryQuote") {
                        return Response.json(fulfillmentQuote());
                    }
                    if (path === "/createShipment") {
                        return Response.json({
                            ok: true,
                            id: "shipment-42",
                            expeditionNumber: "12345678",
                            status: "label_ready",
                            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=12345678",
                            createdAt: "2026-07-13T09:00:00.000Z",
                            idempotentReplay: true,
                        });
                    }
                    if (path === "/completeShipmentCreation") {
                        return Response.json({ status: "succeeded" });
                    }
                    if (path === "/claimShipmentCancellations") {
                        return Response.json({ items: [] });
                    }
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(calls.find((call) => call.path === "/createShipment")?.body).toMatchObject({
            externalOrderId: "order-public-42",
            deliveryQuoteId: "quote-42",
            metadata: { financialTermsHash: "terms-42" },
        });
        expect(calls.find((call) => call.path === "/completeShipmentCreation")?.body).toEqual({
            operationId: 501,
            claimToken: "00000000-0000-4000-8000-000000000501",
            providerReference: "12345678",
            providerShipmentId: "shipment-42",
            providerSnapshot: { status: "label_ready", createdAt: "2026-07-13T09:00:00.000Z" },
        });
    });
}

import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, requiredFunction } from "../harness";

export function registerShipmentProjectionTests(): void {
    test("gets buyer and seller shipment projections with one Delivery call and preserves an empty result", async () => {
        const { sources, functions } = await installedFunctions();
        const shipment = {
            id: "shipment-42",
            expeditionNumber: "12345678",
            status: "available_for_pickup",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678",
            deliveryRelayLocation: "FR-024474",
            latestEventLabel: "Disponible au Point Relais",
            latestEventAt: "2026-07-14T11:00:00.000Z",
            carrierAcceptedAt: "2026-07-13T08:00:00.000Z",
            sellerHandoffDeclaredAt: "2026-07-13T07:30:00.000Z",
            recipientHandoffAt: "",
            createdAt: "2026-07-12T09:00:00.000Z",
            events: [
                {
                    normalizedStatus: "available_for_pickup",
                    occurredAt: "2026-07-14T11:00:00.000Z",
                    eventLabel: "Disponible au Point Relais",
                    eventDate: "2026-07-14",
                    eventTime: "11:00",
                    location: "PARIS",
                },
            ],
        };
        const cases = [
            {
                functionId: "getShipmentForOrder",
                userId: "buyer-subject",
                ownershipPath: "/system/order/payment-context",
                ownership: { id: 42, publicId: "order-public-42", buyerCmsUserId: "buyer-subject" },
                response: {
                    orderId: 42,
                    orderPublicId: "order-public-42",
                    shipments: [
                        {
                            id: shipment.id,
                            expeditionNumber: shipment.expeditionNumber,
                            status: shipment.status,
                            trackingUrl: shipment.trackingUrl,
                            deliveryRelayLocation: shipment.deliveryRelayLocation,
                            latestEventLabel: shipment.latestEventLabel,
                            latestEventAt: shipment.latestEventAt,
                            carrierAcceptedAt: shipment.carrierAcceptedAt,
                            recipientHandoffAt: shipment.recipientHandoffAt,
                            createdAt: shipment.createdAt,
                            events: shipment.events,
                        },
                    ],
                },
            },
            {
                functionId: "getShipmentForMySale",
                userId: "seller-subject",
                ownershipPath: "/seller-context",
                ownership: {
                    id: 42,
                    publicId: "order-public-42",
                    orderNumber: "CO-42",
                    sellerId: "seller-subject",
                    fulfillmentStatus: "awaiting_shipment",
                },
                response: {
                    orderId: 42,
                    orderPublicId: "order-public-42",
                    orderNumber: "CO-42",
                    shipments: [shipment],
                },
            },
        ];

        for (const testCase of cases) {
            const fn = await requiredFunction(functions, testCase.functionId);
            for (const items of [[shipment], []]) {
                const calls: string[] = [];
                const response = await executeFunction(
                    fn,
                    new Request(`https://cms.test/functions/${testCase.functionId}?orderId=42`),
                    {
                        sources,
                        user: { id: testCase.userId, role: "user" },
                        deps: {
                            fetchImpl: async (input) => {
                                const request = new Request(input);
                                const url = new URL(request.url);
                                calls.push(url.pathname);
                                if (url.pathname === testCase.ownershipPath) {
                                    return Response.json(testCase.ownership);
                                }
                                if (url.pathname === "/shipmentForExternalOrder") {
                                    expect(url.searchParams.get("externalOrderId")).toBe("order-public-42");
                                    return Response.json({ items });
                                }
                                throw new Error(`unexpected request: ${request.method} ${request.url}`);
                            },
                        },
                    },
                );

                expect(response.status).toBe(200);
                expect(calls).toEqual([testCase.ownershipPath, "/shipmentForExternalOrder"]);
                expect(await response.json()).toEqual(
                    items.length ? testCase.response : { ...testCase.response, shipments: [] },
                );
            }
        }
    });
}

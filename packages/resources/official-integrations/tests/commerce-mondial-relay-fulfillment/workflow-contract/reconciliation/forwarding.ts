import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, reconciliationHealthResponse, request, requiredFunction } from "../harness";

export function registerReconciliationForwardingTests(): void {
    test("forwards normalized reconciliation events to Commerce without browser identity", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: unknown[] = [];
        const acknowledged: unknown[] = [];
        const reconciliationRequests: unknown[] = [];
        const response = await executeFunction(
            fn,
            request("reconcileMondialRelayFulfillments", {
                runKey: "fulfillment-worker-1",
                limit: 25,
            }),
            {
                sources,
                user: { id: "system", role: "admin" },
                deps: {
                    fetchImpl: async (input, init) => {
                        const req = new Request(input, init);
                        const path = new URL(req.url).pathname;
                        const health = await reconciliationHealthResponse(req);
                        if (health) {
                            return health;
                        }
                        if (path === "/reconcileShipments") {
                            reconciliationRequests.push(await req.json());
                            return Response.json({
                                processed: 1,
                                shipments: [{ id: "shipment-42", status: "collected_by_recipient" }],
                                events: [
                                    {
                                        eventId: 101,
                                        claimToken: "00000000-0000-4000-8000-000000000101",
                                        projectionAttempts: 1,
                                        orderPublicId: "order-public-42",
                                        providerEventId: "mondial-relay|12345678|2026-07-13|11:30|recipient",
                                        normalizedStatus: "collected_by_recipient",
                                        occurredAt: "2026-07-13T09:30:00.000Z",
                                        providerReference: "12345678",
                                        recipientHandoffAt: "2026-07-13T09:30:00.000Z",
                                    },
                                ],
                                claimReturnEvents: [],
                            });
                        }
                        if (path === "/recordOrderFulfillment") {
                            recorded.push(await req.json());
                            return Response.json({
                                orderId: 42,
                                orderPublicId: "order-public-42",
                                status: "collected_by_recipient",
                                providerReference: "12345678",
                                recipientHandoffAt: "2026-07-13T09:30:00.000Z",
                                claimByAt: "2026-07-15T09:30:00.000Z",
                                releaseEligibleAt: "2026-07-15T09:30:00.000Z",
                                version: 3,
                            });
                        }
                        if (path === "/acknowledgeShipmentEvent") {
                            acknowledged.push(await req.json());
                            return Response.json({ acknowledged: true });
                        }
                        throw new Error(`unexpected request: ${req.url}`);
                    },
                },
            },
        );
        expect(response.status).toBe(200);
        expect(reconciliationRequests).toEqual([{ runKey: "fulfillment-worker-1", limit: 8 }]);
        expect(recorded).toEqual([
            {
                orderPublicId: "order-public-42",
                providerEventId: "mondial-relay|12345678|2026-07-13|11:30|recipient",
                normalizedStatus: "collected_by_recipient",
                occurredAt: "2026-07-13T09:30:00.000Z",
                providerReference: "12345678",
                recipientHandoffAt: "2026-07-13T09:30:00.000Z",
            },
        ]);
        expect(acknowledged).toEqual([
            {
                eventId: 101,
                claimToken: "00000000-0000-4000-8000-000000000101",
            },
        ]);
    });
}

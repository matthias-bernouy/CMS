import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, reconciliationHealthResponse, request, requiredFunction } from "../harness";

export function registerClaimReturnEventTests(): void {
    test("projects and acknowledges claim return carrier events through the worker", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: unknown[] = [];
        const acknowledged: unknown[] = [];
        const response = await executeFunction(
            fn,
            request("reconcileMondialRelayFulfillments", {
                runKey: "claim-return-worker",
                limit: 24,
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
                            return Response.json({
                                processed: 1,
                                shipments: [{ id: "return-shipment-7", status: "carrier_accepted" }],
                                events: [],
                                claimReturnEvents: [
                                    {
                                        eventId: 107,
                                        claimToken: "00000000-0000-4000-8000-000000000107",
                                        projectionAttempts: 1,
                                        claimId: 7,
                                        externalOrderId: "claim-return:7",
                                        providerEventId: "provider-event-7",
                                        normalizedStatus: "carrier_accepted",
                                        occurredAt: "2026-07-13T09:00:00.000Z",
                                        providerReference: "87654321",
                                        providerEvidence: {
                                            provider: "mondial-relay",
                                            providerStatus: "carrier_accepted",
                                        },
                                    },
                                ],
                            });
                        }
                        if (path === "/recordClaimReturnDelivery") {
                            recorded.push(await req.json());
                            return Response.json({
                                id: 7,
                                status: "return_required",
                                returnDeliveryStatus: "carrier_accepted",
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
        expect(recorded).toEqual([
            {
                claimId: 7,
                providerEventId: "provider-event-7",
                providerReference: "87654321",
                normalizedStatus: "carrier_accepted",
                occurredAt: "2026-07-13T09:00:00.000Z",
                providerEvidence: { provider: "mondial-relay", providerStatus: "carrier_accepted" },
            },
        ]);
        expect(acknowledged).toEqual([
            {
                eventId: 107,
                claimToken: "00000000-0000-4000-8000-000000000107",
            },
        ]);
    });
}

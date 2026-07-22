import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, reconciliationHealthResponse, request, requiredFunction } from "../harness";

export function registerPendingProjectionTests(): void {
    test("leaves a Delivery event pending when Commerce projection fails", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        let acknowledged = false;
        const response = await executeFunction(
            fn,
            request("reconcileMondialRelayFulfillments", {
                runKey: "fulfillment-worker-2",
                limit: 1,
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
                                processed: 0,
                                shipments: [],
                                events: [
                                    {
                                        eventId: 102,
                                        claimToken: "00000000-0000-4000-8000-000000000102",
                                        projectionAttempts: 1,
                                        orderPublicId: "order-public-42",
                                        providerEventId: "mondial-relay|12345678|lost",
                                        normalizedStatus: "lost",
                                        occurredAt: "2026-07-13T09:30:00.000Z",
                                        providerReference: "12345678",
                                    },
                                ],
                                claimReturnEvents: [],
                            });
                        }
                        if (path === "/recordOrderFulfillment") {
                            return Response.json({ error: "temporarily unavailable" }, { status: 503 });
                        }
                        if (path === "/acknowledgeShipmentEvent") {
                            acknowledged = true;
                        }
                        if (path === "/failShipmentEventProjection") {
                            return Response.json({
                                id: 102,
                                projectionStatus: "retry_wait",
                                projectionAttempts: 1,
                                projectionNextAttemptAt: "2026-07-13T09:31:00.000Z",
                                projectionLastError: "Commerce order fulfillment projection failed",
                            });
                        }
                        return Response.json({ acknowledged: true });
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(acknowledged).toBe(false);
    });
}

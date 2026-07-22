import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, reconciliationHealthResponse, request, requiredFunction } from "../harness";

export function registerProjectionBatchTests(): void {
    test("drains and acknowledges a full eight-event Delivery projection batch", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: number[] = [];
        const acknowledged: number[] = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "full-delivery-batch", limit: 8 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/reconcileShipments") {
                        return Response.json({
                            processed: 8,
                            shipments: [],
                            claimReturnEvents: [],
                            events: Array.from({ length: 8 }, (_, index) => ({
                                eventId: 300 + index,
                                claimToken: `claim-${300 + index}`,
                                projectionAttempts: 1,
                                orderPublicId: `order-${300 + index}`,
                                providerEventId: `provider-${300 + index}`,
                                normalizedStatus: "in_transit",
                                occurredAt: `2026-07-13T09:${String(index).padStart(2, "0")}:00.000Z`,
                                providerReference: `expedition-${300 + index}`,
                            })),
                        });
                    }
                    if (path === "/recordOrderFulfillment") {
                        const body = (await req.json()) as Record<string, unknown>;
                        recorded.push(Number(String(body.providerEventId).replace("provider-", "")));
                        return Response.json({ orderPublicId: body.orderPublicId, status: "in_transit" });
                    }
                    if (path === "/acknowledgeShipmentEvent") {
                        const body = (await req.json()) as Record<string, unknown>;
                        acknowledged.push(Number(body.eventId));
                        return Response.json({ acknowledged: true });
                    }
                    throw new Error(`unexpected full-batch call: ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(recorded).toHaveLength(8);
        expect(acknowledged).toEqual(Array.from({ length: 8 }, (_, index) => 300 + index));
    });
}

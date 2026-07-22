import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, reconciliationHealthResponse, request, requiredFunction } from "../harness";

export function registerPoisonProjectionTests(): void {
    test("continues after a poison event and acknowledges only the following successful event", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: string[] = [];
        const acknowledged: number[] = [];
        const failed: number[] = [];
        const response = await executeFunction(
            fn,
            request("reconcileMondialRelayFulfillments", {
                runKey: "poison-worker",
                limit: 8,
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
                                claimReturnEvents: [],
                                events: [201, 202].map((id) => ({
                                    eventId: id,
                                    claimToken: `token-${id}`,
                                    projectionAttempts: 1,
                                    orderPublicId: `order-${id}`,
                                    providerEventId: `provider-${id}`,
                                    normalizedStatus: "carrier_accepted",
                                    occurredAt: "2026-07-13T09:30:00.000Z",
                                    providerReference: `expedition-${id}`,
                                    carrierAcceptedAt: "2026-07-13T09:30:00.000Z",
                                })),
                            });
                        }
                        if (path === "/recordOrderFulfillment") {
                            const body = (await req.json()) as Record<string, unknown>;
                            recorded.push(String(body.providerEventId));
                            return Response.json({
                                orderId: Number(String(body.orderPublicId).replace("order-", "")),
                                orderPublicId: body.orderPublicId,
                                status: "carrier_accepted",
                                providerReference: body.providerReference,
                                version: 2,
                            });
                        }
                        if (path === "/acknowledgeShipmentEvent") {
                            const body = (await req.json()) as Record<string, unknown>;
                            acknowledged.push(Number(body.eventId));
                            if (body.eventId === 201) {
                                return Response.json({ error: "temporary ack failure" }, { status: 503 });
                            }
                            return Response.json({ acknowledged: true });
                        }
                        if (path === "/failShipmentEventProjection") {
                            const body = (await req.json()) as Record<string, unknown>;
                            failed.push(Number(body.eventId));
                            return Response.json({
                                id: body.eventId,
                                projectionStatus: "retry_wait",
                                projectionAttempts: 1,
                                projectionNextAttemptAt: "2026-07-13T09:31:00.000Z",
                                projectionLastError: body.error,
                            });
                        }
                        throw new Error(`unexpected request: ${req.url}`);
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(recorded).toEqual(["provider-201", "provider-202"]);
        expect(acknowledged).toEqual([201, 202]);
        expect(failed).toEqual([201]);
        expect(await response.json()).toMatchObject({
            events: [
                { eventId: 201, providerEventId: "provider-201", projectionFailed: true },
                { orderPublicId: "order-202", status: "carrier_accepted" },
            ],
        });
    });
}

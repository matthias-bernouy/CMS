import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerDeliveryHealthTests(): void {
    test("publishes global liveness separately from isolated order Delivery health", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "publishMondialRelayDeliveryHealth");
        const orderBodies: Array<Record<string, unknown>> = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "delivery-health-run", limit: 24 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/deliveryProjectionHealth") {
                        return Response.json({
                            checkedAt: "2026-07-13T09:30:00.000Z",
                            pendingProjectionCount: 0,
                            manualReviewCount: 1,
                            trackingErrorCount: 0,
                            orders: [
                                {
                                    externalOrderId: "00000000-0000-4000-8000-00000000000a",
                                    shipmentId: "shipment-a",
                                    providerReference: "11111111",
                                    shipmentStatus: "manual_review",
                                    pendingProjectionCount: 0,
                                    manualReviewCount: 1,
                                    trackingErrorCount: 0,
                                    trackingCheckedAt: "2026-07-13T09:29:00.000Z",
                                },
                                {
                                    externalOrderId: "00000000-0000-4000-8000-00000000000b",
                                    shipmentId: "shipment-b",
                                    providerReference: "22222222",
                                    shipmentStatus: "collected_by_recipient",
                                    pendingProjectionCount: 0,
                                    manualReviewCount: 0,
                                    trackingErrorCount: 0,
                                    trackingCheckedAt: "2026-07-13T09:29:30.000Z",
                                },
                            ],
                        });
                    }
                    if (path === "/recordDeliveryReconciliationHealth") {
                        return Response.json(await req.json());
                    }
                    if (path === "/recordDeliveryOrderReconciliationHealth") {
                        const body = (await req.json()) as Record<string, unknown>;
                        orderBodies.push(body);
                        return Response.json(body);
                    }
                    throw new Error(`unexpected health call: ${req.url}`);
                },
            },
        });
        expect(response.status).toBe(200);
        expect(orderBodies).toHaveLength(2);
        expect(orderBodies).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    orderPublicId: "00000000-0000-4000-8000-00000000000a",
                    manualReviewCount: 1,
                }),
                expect.objectContaining({
                    orderPublicId: "00000000-0000-4000-8000-00000000000b",
                    manualReviewCount: 0,
                }),
            ]),
        );
    });
}

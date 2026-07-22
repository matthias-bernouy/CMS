import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerShipmentCancellationOperationTests(): void {
    test("confirms Delivery cancellation before Commerce can create the refund", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayShipmentOperations");
        const paths: string[] = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "shipment-cancel-recovery", limit: 5 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    paths.push(path);
                    if (path === "/claimShipmentCreations") {
                        return Response.json({ items: [] });
                    }
                    if (path === "/claimShipmentCancellations") {
                        return Response.json({
                            items: [
                                {
                                    operationId: 601,
                                    claimToken: "00000000-0000-4000-8000-000000000601",
                                    orderPublicId: "order-public-42",
                                    trackingUntil: "2026-07-15T09:00:00.000Z",
                                },
                            ],
                        });
                    }
                    if (path === "/cancelShipmentReservation") {
                        return Response.json({
                            id: "shipment-42",
                            externalOrderId: "order-public-42",
                            expeditionNumber: "12345678",
                            status: "cancelled_unscanned",
                        });
                    }
                    if (path === "/completeShipmentCancellation") {
                        return Response.json({ status: "completed" });
                    }
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(paths.indexOf("/cancelShipmentReservation")).toBeLessThan(
            paths.indexOf("/completeShipmentCancellation"),
        );
    });
}

import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerShipmentAuthorizationTests(): void {
    test("fails closed before Delivery when Commerce refuses fulfillment", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createShipmentForMySale");
        let reachedDelivery = false;
        const response = await executeFunction(fn, request("createShipmentForMySale", { orderId: "42" }), {
            sources,
            user: { id: "seller-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/shipment-creation-seller-context") {
                        return Response.json({
                            allowed: false,
                            id: 42,
                            publicId: "order-public-42",
                            sellerId: "seller-subject",
                        });
                    }
                    reachedDelivery = true;
                    return Response.json({});
                },
            },
        });
        expect(response.status).toBe(409);
        expect(reachedDelivery).toBe(false);
    });
}

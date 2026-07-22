import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerRecoveryAuthorizationTests(): void {
    test("enforces shipment recovery as exact admin-only before mutation", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "recoverMondialRelayShipmentCreation");
        expect(fn.access).toEqual({ mode: "admin" });

        let calls = 0;
        const response = await executeFunction(
            fn,
            request(fn.id, {
                shipmentId: "shipment-unknown-42",
                orderPublicId: "order-public-42",
                expeditionNumber: "12345678",
                reason: "Verified against the provider back office",
            }),
            {
                sources,
                user: { id: "custom-operator", role: "custom" },
                deps: {
                    fetchImpl: async () => {
                        calls++;
                        return Response.json({});
                    },
                },
            },
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "Shipment recovery requires an admin",
        });
        expect(calls).toBe(0);
    });
}

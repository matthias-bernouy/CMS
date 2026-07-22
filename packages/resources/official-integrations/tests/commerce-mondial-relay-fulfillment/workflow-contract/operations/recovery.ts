import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerUnknownShipmentRecoveryTests(): void {
    test("completes Commerce immediately after an audited Delivery unknown-shipment recovery", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "recoverMondialRelayShipmentCreation");
        const paths: string[] = [];
        let commerceBody: unknown;
        const response = await executeFunction(
            fn,
            request(fn.id, {
                shipmentId: "shipment-unknown-42",
                orderPublicId: "order-public-42",
                expeditionNumber: "12345678",
                labelUrl: "https://connect-api-sandbox.mondialrelay.com/label.pdf",
                reason: "Verified against the provider back office",
            }),
            {
                sources,
                user: { id: "cms-administrator", role: "admin" },
                deps: {
                    fetchImpl: async (input, init) => {
                        const req = new Request(input, init);
                        const path = new URL(req.url).pathname;
                        paths.push(path);
                        if (path === "/recoverUnknownShipment") {
                            return Response.json({
                                id: "shipment-unknown-42",
                                externalOrderId: "order-public-42",
                                expeditionNumber: "12345678",
                                status: "created",
                            });
                        }
                        if (path === "/recoverOrderShipmentCreation") {
                            commerceBody = await req.json();
                            return Response.json({ status: "succeeded", providerReference: "12345678" });
                        }
                        throw new Error(`unexpected recovery call: ${req.url}`);
                    },
                },
            },
        );
        expect(response.status).toBe(200);
        expect(paths).toEqual(["/recoverUnknownShipment", "/recoverOrderShipmentCreation"]);
        expect(commerceBody).toMatchObject({
            orderPublicId: "order-public-42",
            providerReference: "12345678",
            providerShipmentId: "shipment-unknown-42",
            reason: "Verified against the provider back office",
        });
    });
}

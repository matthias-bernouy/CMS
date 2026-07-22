import { expect, test } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import { installedFunctions, request, requiredFunction } from "../harness";

export function registerClaimReturnHandoffTests(): void {
    test("records claim return handoff only from a claim-bound provider shipment", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "recordMondialRelayClaimReturnRecipientHandoff");
        let recorded: unknown;
        const response = await executeFunction(
            fn,
            request("recordMondialRelayClaimReturnRecipientHandoff", {
                claimId: 7,
                expeditionNumber: "87654321",
            }),
            {
                sources,
                user: { id: "system", role: "admin" },
                deps: {
                    fetchImpl: async (input, init) => {
                        const req = new Request(input, init);
                        const path = new URL(req.url).pathname;
                        if (path === "/shipmentTrackingContext") {
                            expect(new URL(req.url).searchParams.get("expeditionNumber")).toBe("87654321");
                            return Response.json({
                                shipment: {
                                    id: "return-shipment-7",
                                    externalOrderId: "claim-return:7",
                                    expeditionNumber: "87654321",
                                    status: "collected_by_recipient",
                                    recipientHandoffAt: "2026-07-13T14:30:00.000Z",
                                },
                                tracking: {
                                    expeditionNumber: "87654321",
                                    status: "collected_by_recipient",
                                    carrierAcceptedAt: "2026-07-12T09:00:00.000Z",
                                    recipientHandoffAt: "2026-07-13T14:30:00.000Z",
                                    events: [],
                                },
                            });
                        }
                        if (path === "/recordClaimReturnDelivery") {
                            recorded = await req.json();
                            return Response.json({
                                id: 7,
                                status: "return_required",
                                returnDeliveryStatus: "recipient_handoff",
                            });
                        }
                        throw new Error(`unexpected request: ${req.url}`);
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(recorded).toEqual({
            claimId: 7,
            providerEventId: "mondial-relay-return|87654321|recipient_handoff|2026-07-13T14:30:00.000Z",
            providerReference: "87654321",
            normalizedStatus: "recipient_handoff",
            occurredAt: "2026-07-13T14:30:00.000Z",
            providerEvidence: {
                provider: "mondial-relay",
                shipmentId: "return-shipment-7",
                providerStatus: "collected_by_recipient",
            },
        });
    });
}

import { describe, expect, test } from "bun:test";
import { declareSellerHandoff } from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/shipment/shipment-operations";
import { shipmentRow, useDatabase } from "./harness";

describe("Mondial Relay seller handoff contracts", () => {
    test("returns the exact public projection through one actor-scoped RPC", async () => {
        const database = useDatabase();

        const result = await declareSellerHandoff("order-42", "seller-42");

        expect(result).toEqual({
            id: "shipment-42",
            externalOrderId: "order-42",
            expeditionNumber: "12345678",
            status: "label_ready",
            carrierAcceptedAt: null,
            recipientHandoffAt: null,
            sellerHandoffDeclaredAt: expect.any(String),
        });
        expect(Object.keys(result)).toEqual([
            "id", "externalOrderId", "expeditionNumber", "status",
            "carrierAcceptedAt", "recipientHandoffAt",
            "sellerHandoffDeclaredAt",
        ]);
        expect(JSON.stringify(result)).not.toContain("Private Buyer");
        expect(JSON.stringify(result)).not.toContain("private-label");
        expect(database.calls.map(call => [call.method, call.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/declare_seller_handoff"],
        ]);
        expect(database.calls[0]?.body).toEqual({
            p_external_order_id: "order-42",
            p_seller_cms_user_id: "seller-42",
        });
        expect(database.storedRow()?.seller_handoff_declared_at).toBe(
            result.sellerHandoffDeclaredAt,
        );
    });

    test("replays a declaration before writing a second timestamp", async () => {
        const database = useDatabase();

        const first = await declareSellerHandoff("order-42", "seller-42");
        const replay = await declareSellerHandoff("order-42", "seller-42");

        expect(replay).toEqual(first);
        expect(database.calls.map(call => call.method)).toEqual([
            "POST", "POST",
        ]);
        expect(database.storedRow()?.seller_handoff_declared_at).toBe(
            first.sellerHandoffDeclaredAt,
        );
    });

    test("replays the first timestamp after carrier state progresses", async () => {
        const timestamp = "2026-07-21T08:00:00.000Z";
        const carrierAcceptedAt = "2026-07-21T08:01:00.000Z";
        const database = useDatabase({
            row: shipmentRow({
                status: "carrier_accepted",
                carrier_accepted_at: carrierAcceptedAt,
                seller_handoff_declared_at: timestamp,
            }),
        });

        const result = await declareSellerHandoff("order-42", "seller-42");

        expect(result).toEqual({
            id: "shipment-42",
            externalOrderId: "order-42",
            expeditionNumber: "12345678",
            status: "carrier_accepted",
            carrierAcceptedAt,
            recipientHandoffAt: null,
            sellerHandoffDeclaredAt: timestamp,
        });
        expect(database.calls.map(call => call.method)).toEqual(["POST"]);
        expect(database.storedRow()?.seller_handoff_declared_at).toBe(timestamp);
    });
});

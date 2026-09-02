import { describe, expect, test } from "bun:test";
import { HttpError } from "../../connectors/supabase/functions/cms-delivery/http";
import { declareSellerHandoff } from "../../connectors/supabase/functions/cms-delivery/shipment/shipment-operations";
import { shipmentRow, useDatabase } from "./harness";

describe("Mondial Relay seller handoff boundaries", () => {
    test("rejects an empty order before database or provider work", async () => {
        const database = useDatabase();

        await expectFailure(declareSellerHandoff("", "seller-42"), 400, "externalOrderId is required");
        expect(database.calls).toEqual([]);
    });

    test("rejects an empty seller before database or provider work", async () => {
        const database = useDatabase();

        await expectFailure(declareSellerHandoff("order-42", ""), 400, "seller CMS user id is required");
        expect(database.calls).toEqual([]);
    });

    test("preserves the missing-shipment response through one RPC", async () => {
        const database = useDatabase({ row: null });

        await expectFailure(declareSellerHandoff("missing-order", "seller-42"), 404, "shipment not found");
        expect(database.calls.map((call) => call.method)).toEqual(["POST"]);
    });

    test("preserves every current-state refusal without writing", async () => {
        for (const row of [
            shipmentRow({ status: "created" }),
            shipmentRow({ status: "carrier_accepted" }),
            shipmentRow({
                status: "label_ready",
                carrier_accepted_at: "2026-07-21T08:01:00.000Z",
            }),
        ]) {
            const database = useDatabase({ row });
            await expectFailure(
                declareSellerHandoff("order-42", "seller-42"),
                409,
                "seller handoff cannot be declared for the current shipment state",
            );
            expect(database.calls.map((call) => call.method)).toEqual(["POST"]);
        }
    });

    test("preserves the defensive mutation-conflict response", async () => {
        const database = useDatabase({ mutationConflict: true });

        await expectFailure(
            declareSellerHandoff("order-42", "seller-42"),
            409,
            "shipment state changed while declaring seller handoff",
        );
        expect(database.calls.map((call) => call.method)).toEqual(["POST"]);
    });

    test("redacts an unexpected database failure", async () => {
        const database = useDatabase({ failureMethod: "POST" });

        await expectFailure(
            declareSellerHandoff("order-42", "seller-42"),
            502,
            "Supabase Data API request failed (500)",
        );
        expect(database.calls).toHaveLength(1);
    });

    test("hides a shipment owned by another seller", async () => {
        const database = useDatabase();

        await expectFailure(declareSellerHandoff("order-42", "seller-other"), 404, "shipment not found");
        expect(database.calls.map((call) => call.method)).toEqual(["POST"]);
    });
});

async function expectFailure(promise: Promise<unknown>, status: number, message: string): Promise<void> {
    try {
        await promise;
        throw new Error("expected seller handoff to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({ status, message });
    }
}

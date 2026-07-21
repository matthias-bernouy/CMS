import { describe, expect, test } from "bun:test";
import { HttpError } from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/http";
import { declareSellerHandoff } from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/shipment/shipment-operations";
import { shipmentRow, useDatabase } from "./harness";

describe("Mondial Relay seller handoff boundaries", () => {
    test("rejects an empty order before database or provider work", async () => {
        const database = useDatabase();

        await expectFailure(
            declareSellerHandoff(""),
            400,
            "externalOrderId is required",
        );
        expect(database.calls).toEqual([]);
    });

    test("preserves the missing-shipment response after one read", async () => {
        const database = useDatabase({ row: null });

        await expectFailure(
            declareSellerHandoff("missing-order"),
            404,
            "shipment not found",
        );
        expect(database.calls.map(call => call.method)).toEqual(["GET"]);
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
                declareSellerHandoff("order-42"),
                409,
                "seller handoff cannot be declared for the current shipment state",
            );
            expect(database.calls.map(call => call.method)).toEqual(["GET"]);
        }
    });

    test("preserves the optimistic-write race response", async () => {
        const database = useDatabase({ patchConflict: true });

        await expectFailure(
            declareSellerHandoff("order-42"),
            409,
            "shipment state changed while declaring seller handoff",
        );
        expect(database.calls.map(call => call.method)).toEqual([
            "GET", "PATCH",
        ]);
    });

    test("redacts an unexpected database failure", async () => {
        const database = useDatabase({ failureMethod: "GET" });

        await expectFailure(
            declareSellerHandoff("order-42"),
            502,
            "Supabase Data API request failed (500)",
        );
        expect(database.calls).toHaveLength(1);
    });

    test("redacts a mutation database failure after the initial read", async () => {
        const database = useDatabase({ failureMethod: "PATCH" });

        await expectFailure(
            declareSellerHandoff("order-42"),
            502,
            "Supabase Data API request failed (500)",
        );
        expect(database.calls.map(call => call.method)).toEqual([
            "GET", "PATCH",
        ]);
    });
});

async function expectFailure(
    promise: Promise<unknown>,
    status: number,
    message: string,
): Promise<void> {
    try {
        await promise;
        throw new Error("expected seller handoff to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({ status, message });
    }
}

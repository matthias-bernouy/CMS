import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerShipmentReservationTest(): void {
    test("keeps a retryable shipment creation eligible for the atomic reservation guard", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const authorization = functionSql(
            schema,
            "get_order_fulfillment_authorization",
            "get_order_label_authorization",
        );
        const reservation = functionSql(schema, "reserve_order_shipment_creation", "claim_pending_shipment_creations");

        for (const boundary of [authorization, reservation]) {
            expect(boundary).toContain("('awaiting_shipment', 'shipment_creating', 'label_created')");
        }
        expect(reservation).toContain("v_operation.status in ('failed', 'requested')");
        expect(reservation).toContain("v_operation.claimed_at < now() - interval '5 minutes'");
        expect(reservation).toContain("v_operation.status in ('unknown', 'manual_review', 'cancelled')");
    });
}

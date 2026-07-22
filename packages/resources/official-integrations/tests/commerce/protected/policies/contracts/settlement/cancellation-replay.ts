import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerCancellationReplayTest(): void {
    test("returns the original result for an exact cancellation replay", async () => {
        const schema = await loadCommerceSchemaSql();
        const cancellation = functionSql(schema, "request_order_cancellation", "review_order_cancellation");

        expect(cancellation).toContain("requested_by_kind = p_actor_kind");
        expect(cancellation).toContain("requested_by = p_actor_id");
        expect(cancellation).toContain("reason = p_reason");
        expect(cancellation).toContain("status <> 'rejected'");
        expect(cancellation).toContain("payment_cancellation_authorization_payload(cancellation.id)");
        expect(cancellation.indexOf("requested_by_kind = p_actor_kind")).toBeLessThan(
            cancellation.indexOf("order cannot be cancelled"),
        );
    });
}

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadSupabaseSchemaSql } from "../../helpers/supabaseSql";

const integrationRoot = resolve(import.meta.dir, "../../../integrations/domains/commerce/versions/1.0.0");

describe("protected C2C claim window", () => {
    test("starts at first observation and serializes claim versus release", async () => {
        const schema = await loadSupabaseSchemaSql(integrationRoot);
        const projection = functionSql(
            schema,
            "record_order_fulfillment_projection",
            "get_order_fulfillment_authorization",
        );
        const claim = functionSql(schema, "open_marketplace_claim", "respond_marketplace_claim");
        const sellerResponse = functionSql(schema, "respond_marketplace_claim", "attach_marketplace_claim_evidence");
        const release = functionSql(schema, "authorize_order_release", "authorize_order_reserve_release");
        const returnProjection = functionSql(schema, "record_claim_return_delivery", "resolve_marketplace_claim");

        expect(schema).toContain("recipient_handoff_first_observed_at timestamptz");
        expect(schema).toContain("claim_window_started_at timestamptz");
        expect(projection).toContain("v_projection_observed_at := clock_timestamp()");
        expect(projection).toContain("coalesce(recipient_handoff_at, p_recipient_handoff_at)");
        expect(projection).toContain("greatest(p_recipient_handoff_at, v_projection_observed_at)");
        expect(projection).toContain("recipient_handoff_timestamp_anomaly");
        expect(claim.indexOf("select * into v_settlement")).toBeLessThan(claim.indexOf("select * into v_fulfillment"));
        expect(release.indexOf("select * into v_settlement")).toBeLessThan(
            release.indexOf("select * into v_fulfillment"),
        );
        expect(sellerResponse).toContain("if clock_timestamp() >= v_claim.seller_response_by_at then");
        expect(sellerResponse).toContain("conflict: seller response deadline elapsed");
        expect(sellerResponse.indexOf("for update of claim")).toBeLessThan(
            sellerResponse.indexOf("clock_timestamp() >= v_claim.seller_response_by_at"),
        );
        expect(claim).toContain("now() >= v_fulfillment.claim_by_at");
        expect(release).toContain("now() < v_fulfillment.release_eligible_at");
        expect(returnProjection).toContain(
            "when return_delivery_status = 'recipient_handoff' then return_delivery_status",
        );
        expect(returnProjection).toContain("return_recipient_handoff_at = coalesce(");
        expect(returnProjection).not.toContain("create_refund_request");
    });
});

function functionSql(schema: string, start: string, end: string): string {
    return schema.slice(
        schema.indexOf(`create or replace function commerce.${start}`),
        schema.indexOf(`create or replace function commerce.${end}`),
    );
}

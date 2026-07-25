import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { loadSupabaseSchemaSql } from "../../helpers/supabaseSql";

const integrationRoot = resolve(import.meta.dir, "../../../integrations/domains/commerce/versions/1.0.0");

describe("commerce 1.0.0 protected workers", () => {
    test("publishes a system-only bounded deadline command", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        if (!definition) {
            throw new Error("commerce definition not found");
        }
        const source = definition.artifacts.find((artifact) => artifact.type === "source");
        if (!source || source.type !== "source") {
            throw new Error("commerce source artifact not found");
        }
        const endpoint = source.source.endpoints.find(
            (candidate) => candidate.endpointId === "processDueOrderDeadlines",
        );

        expect(endpoint).toMatchObject({ method: "POST", access: { mode: "system" } });
        expect(endpoint?.body).toMatchObject({
            type: "object",
            required: ["runKey", "limit"],
            properties: { runKey: { type: "string" }, limit: { type: "number" } },
        });
    });

    test("uses database-clock row locks and fails closed on ambiguous deadlines", async () => {
        const schema = await loadSupabaseSchemaSql(integrationRoot);

        expect(schema).toContain("create or replace function commerce.process_due_order_deadlines");
        expect(schema).toContain("payment_confirmed_at timestamptz");
        expect(schema).toContain("v_payment_confirmed_at := coalesce(");
        expect(schema).toContain("clock_timestamp()");
        expect(schema).toContain(
            "v_payment_confirmed_at\n                                + make_interval(hours => v_protection.seller_handoff_hours)",
        );
        expect(schema).toContain(
            "v_protection.seller_handoff_hours\n                                    + v_protection.scan_grace_hours",
        );
        expect(schema).toContain("for update of order_row, settlement skip locked");
        expect(schema).toContain("commerce.ensure_payment_cancellation_request");
        expect(schema).toContain("payment_deadline_provider_cancellation_pending");
        expect(schema).toContain("provider cancellation must be confirmed before inventory restoration");
        expect(schema).not.toContain("v_attempt.status in ('failed', 'cancelled')");
        expect(schema).toContain("Missing scans without an eligible cancellation never imply a refund");
        expect(schema).toContain("The seller handoff deadline and carrier scan grace are separate facts");
        expect(schema).toContain("seller_handoff_deadline_elapsed_without_declaration");
        expect(schema).toContain("'kind', 'fulfillment_seller_handoff'");
        expect(schema).toContain("'outcome', 'blocked_until_carrier_scan'");
        expect(schema).toContain("and fulfillment.payment_confirmed_at is not null");
        expect(schema).toContain("when blocking_reason = 'seller_handoff_deadline_elapsed_without_declaration'");
        expect(schema).toContain("resolved_by = 'trusted-carrier-acceptance'");
        expect(schema).toContain("manual review is required before any financial decision");
        expect(schema).toContain("review_order_cancellation_as(");
        expect(schema).toContain("v_candidate.id, 'approved', 'system', 'deadline-worker:'");
        expect(schema).toContain("'awaiting_shipment', 'shipment_creating', 'label_created'");
        expect(schema).toContain(
            "'requested', 'approved', 'provider_cancellation_pending',\n                        'refund_pending', 'manual_review'",
        );
    });
});

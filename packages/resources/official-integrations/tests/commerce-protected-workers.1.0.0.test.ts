import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("commerce 1.0.0 protected workers", () => {
    test("publishes a system-only bounded deadline command", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        if (!definition) throw new Error("commerce definition not found");
        const source = definition.artifacts.find(artifact => artifact.type === "source");
        if (!source || source.type !== "source") throw new Error("commerce source artifact not found");
        const endpoint = source.source.endpoints.find(candidate => candidate.endpointId === "processDueOrderDeadlines");

        expect(endpoint).toMatchObject({ method: "POST", access: { mode: "system" } });
        expect(endpoint?.body).toMatchObject({
            type: "object",
            required: ["runKey", "limit"],
            properties: { runKey: { type: "string" }, limit: { type: "number" } },
        });
    });

    test("uses database-clock row locks and fails closed on ambiguous deadlines", async () => {
        const schema = await Bun.file(new URL(
            "../integrations/commerce/versions/1.0.0/connectors/supabase/schema.sql",
            import.meta.url,
        )).text();

        expect(schema).toContain("create or replace function commerce.process_due_order_deadlines");
        expect(schema).toContain("for update of order_row, settlement skip locked");
        expect(schema).toContain("commerce.ensure_payment_cancellation_request");
        expect(schema).toContain("payment_deadline_provider_cancellation_pending");
        expect(schema).toContain("provider cancellation must be confirmed before inventory restoration");
        expect(schema).not.toContain("v_attempt.status in ('failed', 'cancelled')");
        expect(schema).toContain("Missing scans without an eligible cancellation never imply a refund");
        expect(schema).toContain("support review is required before any financial decision");
    });
});

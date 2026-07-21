import { describe, expect, test } from "bun:test";

const schemaUrl = new URL(
    "../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql",
    import.meta.url,
);

describe("Mondial Relay shipment creation database contracts", () => {
    test("validates, reserves or replays one shipment atomically without provider work", async () => {
        const schema = await Bun.file(schemaUrl).text();
        const definition = sqlFunction(schema, "delivery.reserve_shipment_creation");

        expect(definition).toContain("returns jsonb");
        expect(definition).toContain("language plpgsql");
        expect(definition).toContain("security invoker");
        expect(definition).toContain("set search_path = ''");
        expect(definition).toContain("on conflict (idempotency_key) do nothing");
        expect(definition).toContain("v_existing.raw_request is distinct from v_candidate.raw_request");
        expect(definition).toContain("from delivery.delivery_quotes");
        expect(definition).toContain("from delivery.relay_selections");
        expect(definition).toContain("shipment creation lease expired before a provider outcome was attached");
        expect(definition).toContain("shipment reservation does not match validated quote context");
        expect(definition).not.toContain("http_");
        expect(schema).toContain(
            "revoke execute on function delivery.reserve_shipment_creation(jsonb, jsonb, text, text, text, timestamptz)\n"
            + "    from public, anon, authenticated;",
        );
        expect(schema).toContain(
            "grant execute on function delivery.reserve_shipment_creation(jsonb, jsonb, text, text, text, timestamptz)\n"
            + "    to service_role;",
        );
    });

    test("preserves omitted optional columns while retrying a failed reservation", async () => {
        const schema = await Bun.file(schemaUrl).text();
        const definition = sqlFunction(schema, "delivery.retry_shipment_creation");

        expect(definition).toContain(
            "jsonb_populate_record(v_existing, p_reservation)",
        );
        expect(definition).toContain("where shipment.id = p_existing_id and shipment.status = 'failed'");
    });
});

function sqlFunction(schema: string, name: string): string {
    const start = schema.indexOf(`create or replace function ${name}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = schema.indexOf("\n$$;", start);
    expect(end).toBeGreaterThan(start);
    return schema.slice(start, end + 4).toLowerCase();
}

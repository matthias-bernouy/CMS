import { describe, expect, test } from "bun:test";
import { loadSupabaseSchemaSql } from "../../../../../../tests/helpers/supabaseSql";

const integrationRoot = new URL("../../..", import.meta.url);

describe("native Commerce notification schema", () => {
    test("assembles the dedicated queue and its private worker contract", async () => {
        const schema = await loadSupabaseSchemaSql(
            integrationRoot,
            "install/sql/foundation/notifications/manifest.json",
        );

        expect(schema).toContain("create table if not exists commerce.notification_events");
        expect(schema).toContain("create table if not exists commerce.notification_deliveries");
        expect(schema).toContain("create or replace function commerce.claim_notifications");
        expect(schema).toContain("create or replace function commerce.capture_notification_audit_event");
        expect(schema).toContain("from public, anon, authenticated");
        expect(schema).toContain("grant execute on function commerce.claim_notifications");
        expect(schema).not.toContain("commerce.outbox_events");
    });
});

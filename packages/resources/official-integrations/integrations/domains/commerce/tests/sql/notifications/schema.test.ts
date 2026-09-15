import { describe, expect, test } from "bun:test";
import { loadSupabaseSchemaSql } from "../../../../../../tests/helpers/supabaseSql";

const integrationRoot = new URL("../../..", import.meta.url);
const repeatableUrl = new URL("connectors/supabase/repeatables/commerce-1.1.0.sql", integrationRoot);

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

    test("seeds notification data while forced RLS is transactionally suspended", async () => {
        const repeatable = await Bun.file(repeatableUrl).text();

        expect(repeatable).toContain(
            "alter table commerce.notification_configuration no force row level security;\n" +
                "insert into commerce.notification_configuration",
        );
        expect(repeatable).toContain(
            "on conflict (id) do nothing;\n" +
                "alter table commerce.notification_configuration force row level security;",
        );
        expect(repeatable).toContain(
            "alter table commerce.notification_rules no force row level security;\n" +
                "insert into commerce.notification_rules",
        );
        expect(repeatable).toContain(
            "updated_at = now();\n" + "alter table commerce.notification_rules force row level security;",
        );
    });
});

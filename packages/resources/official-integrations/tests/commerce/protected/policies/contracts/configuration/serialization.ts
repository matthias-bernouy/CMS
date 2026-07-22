import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerPolicySerializationTest(): void {
    test("serializes protected C2C publication and rejects stale settings versions", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRevision = functionSql(schema, "create_c2c_policy_revision", "refresh_seller_risk_state");
        const routeRoot = resolve(
            integrationRoot,
            "connectors/supabase/functions/cms-commerce/routes/configuration/protected-policy",
        );
        const route = (
            await Promise.all(
                ["index.ts", "fields.ts", "validation.ts"].map((file) => readFile(resolve(routeRoot, file), "utf8")),
            )
        ).join("\n");

        expect(createRevision).toContain("pg_advisory_xact_lock(hashtextextended('commerce-c2c-policy', 0))");
        expect(createRevision).toContain("from commerce.settings where id = 'default' for update");
        expect(createRevision).toContain("v_settings.version is distinct from p_expected_settings_version");
        expect(createRevision).toContain("conflict: stale settings version");
        expect(createRevision).toContain("select max(version) from commerce.fee_policies");
        expect(route).toContain("is not allowed in a protected C2C policy revision");
        expect(route).toContain("assertAllowedValue(payload.shippingBeneficiary");
        expect(route).toContain("sellerReserveRateBps: [0, 9_999]");
    });
}

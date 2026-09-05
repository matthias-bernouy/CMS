import { describe, expect, test } from "bun:test";
import { loadSupabaseSchemaSql } from "../../../../../../tests/helpers/supabaseSql";

const commerceRoot = new URL("../../..", import.meta.url);
const negotiationRoot = new URL("../../../../../extensions/commerce-negotiation", import.meta.url);

describe("Commerce whole-unit price SQL contracts", () => {
    test("installs an opt-in setting and one authoritative assertion", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot, "install/sql/schema.manifest.json");

        expect(schema).toContain("whole_unit_prices boolean not null default false");
        expect(schema).toContain("create or replace function commerce.assert_offer_price_increment");
        expect(schema).toContain("where id = 'default'\n    for share");
        expect(schema).toContain("validation: % must use whole currency units");
    });

    test("guards every mutable offer-price boundary", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot, "install/sql/schema.manifest.json");

        for (const field of ["accepted price", "minimum price", "maximum price", "price"]) {
            expect(schema).toContain(`assert_offer_price_increment`);
            expect(schema).toContain(`'${field}'`);
        }
        expect(schema).toContain("conflict: non-whole offer prices must be resolved before enabling whole-unit prices");
        expect(schema).toContain("proposal.status in ('pending', 'accepted')");
    });

    test("keeps negotiation proposal creation and acceptance aligned", async () => {
        const schema = await loadSupabaseSchemaSql(negotiationRoot);

        expect(schema).toContain("select whole_unit_prices into v_whole_unit_prices");
        expect(schema).toContain("v_minimum := ((v_minimum + 99) / 100) * 100");
        expect(schema).toContain("v_maximum := (v_maximum / 100) * 100");
        expect(schema).toContain("commerce.assert_offer_price_increment(v_proposal.proposed_amount, 'proposed price')");
    });
});

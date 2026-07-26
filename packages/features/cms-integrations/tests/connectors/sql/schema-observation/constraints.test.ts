import { describe, expect, test } from "bun:test";
import { readSupabaseObservedSchemaContract } from "@bernouy/cms-integrations/supabase";
import { catalogOutputs, constraintRows, FixtureCatalogClient } from "./catalogFixtures";

describe("Supabase PostgreSQL constraint observation", () => {
    test.each([
        ["constraint type", { constraint_type: "x" }, /constraint type/],
        ["foreign-key action", { update_action_code: "z" }, /update action/],
        ["foreign-key match", { match_type_code: "z" }, /match type/],
    ])("fails closed on an unknown %s", async (_label, override, expected) => {
        const rows = constraintRows.map((row, index) => (index === 2 ? { ...row, ...override } : row));
        await expect(observe(rows)).rejects.toThrow(expected as RegExp);
    });

    test("requires pg_index null semantics for unique constraints", async () => {
        const rows = constraintRows.map((row, index) => (index === 1 ? { ...row, nulls_not_distinct: null } : row));
        await expect(observe(rows)).rejects.toThrow(/pg_index\.indnullsnotdistinct/);
    });

    test("requires a catalog expression for checks", async () => {
        const rows = constraintRows.map((row, index) => (index === 3 ? { ...row, check_expression: null } : row));
        await expect(observe(rows)).rejects.toThrow(/catalog expression/);
    });
});

function observe(constraints: readonly Record<string, unknown>[]) {
    return readSupabaseObservedSchemaContract({
        client: new FixtureCatalogClient([catalogOutputs[0], catalogOutputs[1], catalogOutputs[2], constraints]),
        owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
        ownedNamespaces: ["audit", "shop"],
    });
}

import { describe, expect, test } from "bun:test";
import { readSupabaseObservedSchemaContract } from "@bernouy/cms-integrations/supabase";
import { catalogOutputs, columnRows, FixtureCatalogClient } from "./catalogFixtures";

describe("Supabase PostgreSQL column observation", () => {
    test.each([
        ["unknown identity", { identity_code: "x" }, /identity_code/],
        ["unknown generated mode", { generated_code: "v" }, /generated_code/],
        ["unknown sequence dependency", { sequence_dependency_code: "n" }, /sequence dependency/],
    ])("fails closed on %s", async (_label, override, expected) => {
        const rows = columnRows.map((row, index) => (index === 2 ? { ...row, ...override } : row));
        await expect(observe(rows)).rejects.toThrow(expected as RegExp);
    });

    test("rejects multiple sequence dependency modes for one column", async () => {
        const identity = columnRows[1]!;
        await expect(observe([...columnRows, { ...identity, sequence_dependency_code: "a" }])).rejects.toThrow(
            /conflicting sequence dependency/,
        );
    });
});

function observe(columns: readonly Record<string, unknown>[]) {
    return readSupabaseObservedSchemaContract({
        client: new FixtureCatalogClient([catalogOutputs[0], catalogOutputs[1], columns, catalogOutputs[3]]),
        owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
        ownedNamespaces: ["audit", "shop"],
    });
}
